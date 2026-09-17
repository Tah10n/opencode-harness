# SWE-PolyBench Verified pilot

This adapter compares ordinary OpenCode (P) with the unchanged installed direct
harness without (H0) and with (H1) TYPE_COMPAT. Official SWE-PolyBench `resolved`
is the primary outcome. Ten tasks, three arms, one model attempt per slot.
See [PLAN.md](PLAN.md) for the selection rule and acceptance boundaries, and
[REPORT.md](REPORT.md) for the stopped 18-run result: 12 assigned slots remain
unknown after admission closed. This batch must not be resumed.

Run from the `feat/native-task-workflow` worktree. Prerequisites are the existing
Docker Desktop, Python 3.12, Node 24, prepared OpenCode 1.18.26 ARM64 binary and
prepared plugin dependencies used by the existing native-task experiments.
No host/system toolchain installation is performed. Local private state stays
under ignored `local/polybench-pilot/`; author containers never mount that root.

Set `PILOT_PYTHON` to the existing Python 3.12 executable (the bundled Codex
runtime is suitable). The three entry points are:

```sh
"$PILOT_PYTHON" development/polybench-pilot/prepare.py --full
node development/polybench-pilot/run.mjs local/polybench-pilot/batch
local/polybench-pilot/venv/bin/python development/polybench-pilot/evaluate_predictions.py
```

Preparation downloads only the pinned official dataset/evaluator and selected
instance images. It installs evaluator dependencies into a separate venv, checks
gold and genuine test-patch-only baselines, creates clean baseline archives,
checks author isolation, and runs scripted native sessions. It never sends a
real provider request. A partial failed preparation is preserved for inspection;
there is no automatic replacement, calibration retry or image-build fallback.

After preparation, `node development/polybench-pilot/freeze.mjs` writes the
safe manifest and full task prompts. Commit this preparation locally, then put
that commit in ignored `local/polybench-pilot/batch/freeze-commit.json` as
`{"commit":"<full SHA>"}`. The run entry point checks the committed manifest and
local freeze before admission. It does not resume an existing or paused batch.
No availability request, paid smoke, reviewer, replacement session or extra
attempt is implemented. Existing quota/auth/unknown-submission cancellation
rules close admission for the rest of the batch.

The evaluator remains an external checkout. `evaluate.py` invokes its original
CLI using `runpy`, or uses its original DockerManager/test command/parser/scoring
for the genuine baseline. Its container boundary pins exact digests, forbids
implicit pulls and fallback builds, skips unused base-image builds, and uses
network-none/cap-drop/no-new-privileges resource-limited containers. Official
patch order, fuzzy application, tests, parser and scoring are unchanged. An
independent `git apply --check` observation is recorded without patch repair.
Each control and arm gets its own cwd, logs, result directory and repo directory.
Input-copy preparation is bounded at 120 seconds for these large projects; the
1800-second author budget and provider admission policy remain unchanged.

Author images remove the original project/Git history and preparation-only
copies. Authors receive a clean base-commit archive, exact submodule archives
where applicable, original public tests/docs and prepared dependencies. LFS
assets are accepted only if they match committed object IDs or the unchanged
pointer in the official image. All arms set `GIT_LFS_SKIP_SMUDGE=1` so
offline worktree creation preserves those inputs. For VS Code, its unchanged
project script prepares missing Electron 13.5.1 before offline use; the hashed
archive is supplied identically to authors and evaluators. Node 24 and TypeScript 6.0.3 diagnostics are
separate from each historical project toolchain. A standard post-checkout hook
copies the same dependencies, including Code Server’s complete `vendor/modules`,
into new delivery worktrees; relative workspace
links resolve within that worktree. P has no harness plugin or instructions.
All arms share the same offline override and environment facts.

A common external Git collector saves final patches for every arm, including P.
Predictions preserve those bytes, contain no duplicate IDs, and evaluate only
actually submitted slots with captured patches. Missing capture and not-started
slots stay unknown. Raw official outputs, autonomous delivery T, `R and T`,
compiler observations, provider usage and infrastructure errors stay separate.
Cached input and reasoning are token subsets and are never counted twice.

Local checks:

```sh
python3 development/polybench-pilot/verify.py
node --check development/polybench-pilot/run.mjs
node --check development/polybench-pilot/freeze.mjs
```

Scripted preflight requests use local deterministic responses and no credentials;
they are not paid task-runs or model-quality evidence. The reused supported
compiler fixture is never included in benchmark author input. The historical
`PROCESS_CONTAINMENT_UNAVAILABLE` limitation of the general verifier is not
claimed fixed by this container path.

Sources and attribution:
[official evaluator](https://github.com/amazon-science/SWE-PolyBench),
[Verified dataset](https://huggingface.co/datasets/AmazonScience/SWE-PolyBench_Verified),
Rashid et al., *SWE-PolyBench: A multi-language benchmark for repository level
evaluation of coding agents* (2025). Dataset card declares MIT. The upstream
repository LICENSE is retained in [UPSTREAM-LICENSE](UPSTREAM-LICENSE); upstream
source files also carry CC-BY-NC-4.0 headers, which this adapter does not alter.
This is a local pilot, not a full-dataset leaderboard submission or an unseen
holdout. Do not tune the runtime and present these same tasks as confirmation.
