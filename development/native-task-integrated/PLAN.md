# Integrated development comparison — frozen product 797ce6f1

Compare plain OpenCode (P), direct harness without optional components (Hbase), and direct plus sensitivity/investigation (Htools) on two new tasks, each repeated twice. This measures complete project changes, not tool invocation counts. The tool bundle is the treatment; individual component causality is not identified.

## Tasks and provenance

- **A — visual preferences**, Tah10n/Tahion_Personal_site at `1198822c5715651cf654c49cae719c92253dd498`. Existing input controls, storage and canvas/document consumers. New task: durable versioned preferences, legacy migration and cross-tab synchronization. Full task: [visual-preferences](tasks/visual-preferences.md).
- **B — URLSearchParams consumers**, unjs/ufo at `f06c800d0c59f2a4a1b9ba65eb6cb61a84419be6`. Existing stringifyQuery, withQuery and $URL consumers. New task: preserve ordered duplicate entries through public APIs, types and tests. Full task: [url-search-params](tasks/url-search-params.md).

Both inputs are whole public Git archives with one synthetic baseline commit, no upstream history, no previous task or solution. The tasks are new feature requests motivated by existing persistence and query-conversion boundaries, not sampled historical fixes. Public visibility was verified. No task was selected using new model results.

Selection boundary: current VibeRacing was unsuitable because a tracked test exceeds investigator's 512-KiB file bound. The current personal-site tree has a project skill that causes OpenCode to generate project-absolute permissions rejected by the frozen harness. The selected whole historical site predates that skill and retains real background controls/persistence. No source files, skill files or requirements were silently removed. Applicability to those rejected layouts is not established.

The historical site's original `npm run check` has a pre-existing CRLF/Prettier failure. Record that separately. Run lint, delivered tests, TypeScript/build directly if the chained check stops there. Pre-existing untouched formatting failures alone do not make Q false; behavioral regressions, invalid delivered code or missing required tests/types/docs do. Model authors receive the original source and can observe the baseline failure. UFO's original tests and build pass. Dependency versions and tree hashes are frozen; Linux native packages match existing locked Rollup/esbuild versions. No dependency change is required of authors.

## Configuration

All arms: OpenCode 1.18.26, openai/gpt-5.6-luna, high, fresh session/container, 1,800,000 ms whole-attempt deadline, same public task/project information and isolated configured OpenAI route. No explicit equal token budget is claimed.

| Flag | P | Hbase | Htools |
|---|---|---|---|
| harness plugin/instructions/hooks | absent | stock direct | stock direct |
| CONTEXT / CHECKS | off | 0 / 0 | 0 / 0 |
| SENSITIVITY / INVESTIGATION | off | 0 / 0 | 1 / 1 |
| EXTRA_ATTENTION | off | 0 | 0 |
| diagnostic allowance | none | none | existing shared 180 s, one investigator |

P receives the exact full task through OpenCode's native stdin input; positional CLI arguments escape embedded quotes in this installed version. H receives TASK.md through the stock command. The external deadline envelope is adapted from the existing launcher to 1800 seconds; the request forwarding/admission/terminal observer policy is reused. No availability probe, new parser or historical resume is used. No `lib/` or profile runtime files change.

## Frozen order

| Slot | Task | Repeat | Arm |
|---|---|---|---|
| 1 | A | 1 | P |
| 2 | A | 1 | Hbase |
| 3 | A | 1 | Htools |
| 4 | A | 2 | Htools |
| 5 | A | 2 | Hbase |
| 6 | A | 2 | P |
| 7 | B | 1 | Hbase |
| 8 | B | 1 | P |
| 9 | B | 1 | Htools |
| 10 | B | 2 | Htools |
| 11 | B | 2 | P |
| 12 | B | 2 | Hbase |

Keep both repeats, no replacement or best-of-two selection. Ordinary content failure does not stop later slots. New refusal/quota/unknown submission/unconfirmed execution closes admission; unstarted slots remain not_started. Every forwarded request, including title and child requests, counts. Unknown usage is not zero. Cache/reasoning subsets are not added to inclusive totals. No monetary claim without a bill.

## Acceptance frozen before model requests

Q requires a portable patch applied unchanged in an ordinary source copy, correct declared behavior and integration, preservation of valid prior inputs, and required regressions/types/docs. T requires normal native completion (`step_finish: stop`, no error/timeout) and verified termination. D = Q and T. Internal incomplete is not independently Q=false. Accurate limited final prose is acceptable.

A is checked in a real headless Chromium against the built app: legacy and new record loads, invalid record retention, menu/actual canvas/document theme, choices and reload, remote events, two real tabs, no echo writes, latest-field preservation, and storage failures. No dependency on a particular helper or assertion spelling. B is checked through public exports with other inputs covering ordered duplicate/empty/escaped values, object compatibility, withQuery overlay, class serialization/searchParams detachment and append; public type uses and original project checks are retained.

Delivered regression obligations are reviewed by scenario, not filename or assertion subtype. A missing-tests control has no test change; B lacks both new runtime and type regressions. Meaningful sensitivity is checked against a declared behavioral violation; no named Stryker mutant is required. Reference and alternative solutions must pass; missed-consumer, old-valid-input, reload/class and missing-tests controls must fail. A template result or green old suite alone is insufficient.

Evaluation copies receive neutral IDs and no arm configuration; automated Q checks happen before explanatory trace reading where feasible. Author files are never repaired. Follow investigator traces only after quality grading: question/basis/work/patch/disposition/effect. Evaluator, references, other attempts and original solution history are outside every model container and never forwarded.

Report each individual Q/T/D and D counts by task/arm (0/2, 1/2, 2/2). Two repeats are not independent new tasks; do not pool 12 observations into a lift claim. Choose one product-development candidate with the evidence limitations, and do not automatically begin another cycle.

## Verification and publication limits

One actual-input scripted preflight checks exact task receipt, cwd, native tools, component schemas, project commands, original preservation, portable terminal patches and container stop. Preparation errors are corrected before model requests; successful unchanged portions are reused. The general verifier's known PROCESS_CONTAINMENT_UNAVAILABLE remains separate and is not bypassed or called a CI pass. Containers use the existing image, network none, read-only mounts/root, dropped capabilities, no-new-privileges, init, 2 CPUs, 3072 MiB total/1536 MiB work tmpfs.

Only preparation, compact results and public patches are publishable. No source/dependency trees, private sessions, credentials or full provider traces. Preserve PR #25 Draft/base/default. Ordinary push only, no merge/release/manual Actions/full matrix.
