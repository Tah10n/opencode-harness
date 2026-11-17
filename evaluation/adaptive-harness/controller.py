"""Task-local Harness² adapter. No model process or credential access in Python."""
from __future__ import annotations

import contextlib
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent / "vendor"))
from harness2.core.recursion import run_parallel
from harness2.core.spec import BenchSpec, BenchPrompts, ChannelSpec, RunView
from harness2.core.tree import SurfaceSpec
from harness2.core.proposer import Reply
from harness2.core.selection import assign_ids


class AdmissionClosed(BaseException):
    """Bypass upstream's recoverable Exception -> fallback paths on fatal admission loss."""


def rpc(operation, **args):
    # Upstream progress goes to stderr; this is the only stdout protocol.
    sys.__stdout__.write(json.dumps({"operation": operation, **args}) + "\n")
    sys.__stdout__.flush()
    answer = json.loads(sys.stdin.readline())
    if "error" in answer:
        raise AdmissionClosed(answer["error"])
    return answer


SURFACE = SurfaceSpec(
    name="opencode", always_on=("systemprompt.md",), always_on_max=8192,
    always_on_cap_reason="bounded experimental text", skill_dir="skills",
    skill_name_rule="must_match", trigger_hint="Read skills/{name}/SKILL.md.",
    autotrigger_file="systemprompt.md",
    trigger_line="When {desc}, read /template/harness/skills/{name}/SKILL.md.",
    subagent_requires_mode=True, plugin_dir=None, hooks_file=None,
)


class Adapter:
    name = "opencode"

    def __init__(self, root, source):
        self.root, self.source = root, source
        self.substrate = self
        self.spec = BenchSpec(
            name="adaptive-k1", runs_root=root, install_mode="workspace_config",
            prompts=BenchPrompts(
                work="Implement a requested JavaScript change and preserve existing behavior.",
                domain_word="software engineering", inv_levers="Planning and public checks.",
                dom_levers="Boundary cases, parsing and state preservation.",
            ),
            channels={r: ChannelSpec("opencode", "openai/gpt-5.6-luna")
                      for r in ("proposer", "selector")},
        )
        self.runs = {}

    def surface(self):
        return SURFACE

    def tasks(self, split="all"):
        return ["intervals"]

    def domain_of(self, task_id):
        return "software engineering"

    def task_prompt(self, task_id):
        return (self.source / "TASK.md").read_text()

    def task_files(self, task_id):
        return self.source

    def base_harness(self):
        return self.root / "harnesses/base"

    def validate_tree(self, tree):
        reply = rpc("validate", tree=tree)
        if not reply["valid"]:
            raise ValueError(reply["reason"])

    def execute(self, task_id, harness_dir, run_id, *, timeout=None):
        # Upstream wrote this tree from a checked mapping, never from a model path.
        tree = {p.relative_to(harness_dir).as_posix(): p.read_text()
                for p in sorted(harness_dir.rglob("*")) if p.is_file()} if harness_dir else {}
        answer = rpc("solve", label=run_id, tree=tree)
        self.runs[run_id] = answer
        return Path(answer["directory"])

    def delivered(self, run_dir):
        return (run_dir / "model.patch").is_file()

    def trajectory(self, run_dir, *, obs_trunc):
        # No truncation. Native actions, outputs and explicit failures remain readable.
        return (run_dir / "public-trajectory.txt").read_text()

    def deliverable_text(self, run_dir):
        return (run_dir / "model.patch").read_text()

    def deliverable_files(self, run_dir):
        return {"full.patch": self.deliverable_text(run_dir)}

    def score(self, run_dir, task_id):
        raise RuntimeError("Only the independent post-selection command can assess delivery")


class ContainedProposer:
    def __init__(self, root):
        self.root = root

    def call(self, mission, context_dir, label, **kwargs):
        answer = rpc("propose", label=label, mission=mission, context=str(context_dir))
        if not answer["valid"]:
            # An invalid proposal is recoverable; return no workspace so upstream
            # performs its one bounded repair and records fallback if still invalid.
            return Reply(label, answer["reason"], False, attempts=1)
        workspace = self.root / "harvest" / label
        workspace.mkdir(parents=True)
        for rel, text in answer["tree"].items():
            dest = workspace / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text)
        return Reply(label, answer["text"], True, attempts=1, workspace=workspace)


def main():
    root, source, mode = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    adapter = Adapter(root, source)
    first = adapter.execute("intervals", None, "base")
    base = RunView("base", "base", first, True, adapter.delivered(first))
    method = None
    if mode == "adaptive-k1":
        # This is the original pinned algorithm, not a reimplementation of its graph.
        with contextlib.redirect_stdout(sys.stderr):
            method = run_parallel(
                "intervals", 1, [base], adapter=adapter, prop=ContainedProposer(root),
                work_dir=root, run_id_of=lambda label: label,
                base_tree={"systemprompt.md": ""}, propose_workers=1, rollout_workers=1,
            )
        if not method.ok or any(not r.ok or not r.delivered for r in method.rollouts.values()):
            raise AdmissionClosed("incomplete upstream cycle")
        candidates = ["base", "agg1"]  # Explicit local deviation from selection_pool.
    elif mode == "plain-multi":
        for i in range(1, 4):
            adapter.execute("intervals", None, f"plain{i}")
        candidates = list(adapter.runs)
    else:
        candidates = ["base"]
    ids = assign_ids(candidates, task_id="intervals", k=1, mode=mode)
    rpc("select", ids=ids, method=method.to_dict() if method else None)


if __name__ == "__main__":
    try:
        main()
    except AdmissionClosed as exc:
        print(f"admission closed: {exc}", file=sys.stderr)
        sys.exit(2)
