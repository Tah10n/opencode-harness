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

## Development revision after the frozen pilot

The installed reproduction now distinguishes transports. On pinned OpenCode and
SDK 1.18.26, raw HTTP and the external installed SDK accept `format: {type:
"json_schema", schema, retryCount: 0}` and return `info.structured` with
`finish: "tool-calls"`. The same child prompt through the plugin's injected SDK
still fails with `Expected OutputFormatJsonSchema`. The runnable model-free
`scripts/verify-native-task-format.mjs` verifies both paths and records their
actual request/result shapes. HTTP success does not establish embedded-client
compatibility, so the command retains text output without starting another server
or introducing a provider transport.

Supported legacy reviews are adapted deterministically before schema validation.
The adapter renames `files` to `affectedFiles`, `reproduction` to `verification`,
and `verificationFiles` to `proposedVerificationFiles`, preserving array order and
all original strings. Conflicting old/new aliases fail explicitly. The original
response is retained in `review-N-original.json`; the separate object is saved in
`review-N-adapted.json`. Current-schema objects are unchanged on repeated adaptation.
The existing non-executing scanner tolerates trailing commas in legacy text only;
other corrupt or ambiguous input still fails or uses the existing bounded format
correction. There is no extra retry.

Absent legacy finding kinds become `unresolved`, never inferred from `expected`.
An absent verification method remains absent for an unresolved finding. Only the
substantive reproduction stage can resolve a kind with task/contract basis and
actual native evidence; behavior repair still requires a failing assertion.
Legacy `evidenceLimitations: []` means there were no separate category entries;
all existing `unverified` entries remain material, including provenance-like text.
Format correction cannot decide kind or remove findings, obligations, uncertainty
or proposed paths. All eight bookmark review paths reach host scope policy as
proposals, including rejected production and instruction paths.

Controller regressions consume all five unchanged retained response files with
`io.format` forbidden. Bookmark's two findings, seven obligations, four unverified
entries and eight paths reach reproduction without a format request. Expense's
empty findings and delivered obligations do not trigger artificial reproduction;
its remaining uncertainty still prevents completion. The installed scripted
fixture also sends bookmark's original text through the production controller and
reaches reproduction with zero format calls. These are model-free routing checks,
not evidence that a model supplies a correct repair. The prior unsuccessful real
continuation and historical A 5/6, B 4/6 are unchanged; no real run is repeated.

A structured stage may make one format-only correction. It uses a fresh native
session with all registered tools disabled, a deny-all permission boundary and a
host tool-hook denial. Its only task input is the original response, schema and
specific validation error. Original and corrected replies and stage timing are
retained; the request shares the original deadline. Strict schema validation and
semantic conservation prohibit replacing missing obligations/findings with empty
success or inventing expected behavior. No received text is executed. A second
invalid response stops the stage.

Review findings now distinguish behavior defects from missing test/document
material. `affectedFiles` carries information; host preparation policy independently
selects conventional test/document paths, rejects symlinks and explicit edit denies,
and preserves native permission asks. A rejected write proposal does not discard
the review. Actual non-preparation changes still stop the workflow. Passing tests
on correct D0 can deliver missing coverage without a production repair. Grounded
behavior defects still require an observed assertion failure before production
repair, followed by final discriminating and preservation checks.

`determineOutcome` applies after ordinary, disposition and post-repair review.
`evidenceLimitations` records provenance caveats; `unverified` retains concrete
unresolved consumers/checks/requirements. Missing obligations, hypotheses, failed
or stale required checks cannot be cleared by an empty finding list.

The controller's internal retained-review option skips initial implementation for
installed development diagnostics. The public command has no new flag, argument
or mode. Historical twelve-run sources, grader, results and costs remain frozen;
this revision is evaluated separately.
