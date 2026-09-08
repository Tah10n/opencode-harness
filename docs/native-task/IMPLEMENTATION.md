# Native task workflow implementation notes

Base: PR #24, `1e54e21018e340191e69a8f9427ccf8e3330bfcd`.

The implementation targets installed OpenCode 1.18.26. Its versioned
`packages/plugin/src/index.ts`, `tool.ts`, `packages/opencode/src/session/prompt.ts`
and `tool/task.ts` were inspected before implementation. A command hook cannot
return a completed command: native command execution always calls prompt after
`command.execute.before`. The hook also runs after command argument shell
expansion. Consequently the entry point takes no command arguments; the original
requirement is supplied once in `HARNESS_TASK_FILE`, as with diagnostic review.

An opt-in plugin exposes one workflow-control tool. It does not expose repository
operations, a check runner, provider transport, or a repair CLI. The command's
initial native turn must invoke this tool; other parent tools are refused while
that command is armed. A missing invocation is an incomplete workflow, not a
successful task. This bootstrap and final summarization consume native requests
and count in the B budget.

The tool invokes native session APIs sequentially for implementation, separate
review, reproduction and repair. The tool's native abort signal propagates to
active child sessions. There are no idle listeners, background triggers or default
changes. The author uses the command's native agent/model/variant. Review uses
the existing reviewer permission restrictions, with a task-specific output
contract; the diagnostic command and its role remain unchanged.

Snapshots and native tool evidence are local private run artifacts. They are
not signatures or correctness certificates. Source-only snapshot binding cannot
prove that an arbitrary shell command is a meaningful preservation test; review
must examine the source and command evidence. Model reports never manufacture
command passes. Scripted installed tests establish control flow only.

Source references:
- https://github.com/anomalyco/opencode/blob/v1.18.26/packages/plugin/src/index.ts
- https://github.com/anomalyco/opencode/blob/v1.18.26/packages/plugin/src/tool.ts
- https://github.com/anomalyco/opencode/blob/v1.18.26/packages/opencode/src/session/prompt.ts
- https://github.com/anomalyco/opencode/blob/v1.18.26/packages/opencode/src/tool/task.ts

The native worktree API was also inspected. In this version it creates from the
project worktree HEAD, does not accept an exact base ref, and returns before its
checkout/startup jobs complete. The task therefore uses standard Git plumbing
only to create a new detached worktree at the captured base and seed its initial
patch. Native SDK session calls target that directory. There is no automatic
patch application to the original checkout, no cleanup/reset of user work, and
no custom repository operation exposed to the model. Scripted concurrent saves
and staged/partially staged input exercise this boundary.

The installed 1.18.26 server rejected a child prompt's `json_schema` format with
`Expected OutputFormatJsonSchema` before reviewer generation, despite the shape
matching the versioned schema. The workflow uses ordinary native text output and
strict local shape validation instead; malformed output remains incomplete.
The bootstrap's final visible text is bound to the actual workflow result, so a
missing invocation or model-written summary cannot synthesize task completion.
