# Direct author review of conflicting assertions

Direct's implementation prompt now asks the author to establish the original
requirement, preserved public contract and actual input before preserving an old
assertion through a gate, fallback or legacy branch. A preserved contract calls
for a production fix; explicitly replaced behavior permits changing only the
conflicting expectation; mistaken setup needs a meaningful check; ambiguity
remains unresolved without grounds. The author inspects the actual diff and
checks the disputed boundary through the same supported public caller/input.

The addition is **204 English words / 1,505 UTF-8 bytes** (1,506 bytes with its
leading newline). It is inserted only for `strategy=direct` in
`lib/native-task-workflow.mjs`. Materialization copies that module into the
installed bundle; `native-task-plugin.mjs` invokes `runWorkflow` and sends its
implementation prompt through the existing author `session.prompt`. The existing
core profile already distinguishes replaced behavior from preserved contracts;
its bytes, the separate review profiles, D and check-first instructions remain
unchanged. No new flag, stage, final call, classifier, report format or tool.

Changing one expectation cannot remove a mixed test's remaining assertions or
weaken exact outcomes, negative/security cases or test-write permissions. The
host does not establish the truth of an author's classification. Requirement
quotes, new assertions and completion claims confer neither trusted evidence nor
repair authority. Existing observation statuses, failures, cancellation, denial,
admission, shared deadline and patch delivery retain their original meaning.

## Evidence and reproduction

`node development/direct-assertion-review/verify.mjs` checks direct delivery,
frozen pre-change D/check-first prompt hashes, ordinary/review exclusion,
materialized bytes, stage counts, cancellation/denial/deadline and independent
semantic counterexamples. `prior-prompts.json` hashes were derived from the
unchanged `ca72c444b06b3be096cfa22aa6a82968e807a994` workflow using the fixed
`PUBLIC_TASK` input; they guard non-target bytes rather than model behavior.

`node development/direct-assertion-review/run.mjs` uses the existing pinned
Linux image and OpenCode 1.18.26 binary/dependency cache. It exports tracked source
without host worktree Git metadata, overlays only this task's workflow and
fixture files, and mounts the two explicit toolchain resources read-only. The
container has no network beyond local loopback, no credentials, no host network,
no Docker socket, no privileges and no unrelated mounts. Full private requests,
receipts, reports and native output captures remain under ignored
`local/direct-assertion-review/`; the unchanged shared output collector runs
before container removal. No downloads or real model authentication are needed.

The neutral public API normalizes a string. The existing mixed test fixes case
preservation, empty strings, maximum length and type/length rejection. In the
replacement scenario a predetermined native author changes case policy, observes
a real old-assertion failure, introduces an optional gate through native edit,
reads the actual diff, and observes failure through the old one-argument caller.
Within that same session it removes the unjustified gate, changes only the
replaced mixed assertion, delivers an additional regression and runs the relevant
checks after the final edit. There is no host repair or intervening user message.
The preserved-contract scenario receives the same old assertion failure, repairs
production and leaves the entire mixed test unchanged.

Independent acceptance invokes the public API directly with literal expected
results. It rejects the optional gate, a falsely claimed obsolete expectation
when case preservation is still required, and removal of negative validation.
These are fixture checks, not a semantic detector added to the host. Ambiguity
is an explicit instruction boundary, not a promise that the runtime can solve
contradictory requirements. All such assertions still require human assessment.

Both installed patches are applied unchanged to ordinary Git clones. Exact
file inventory, bytes and modes, unchanged mixed assertions, executable mode,
user staged/unstaged/untracked content and independent behavior are checked.
The original checkout and index are compared before and after. No harness paths,
services or dependencies occur in the delivered project patch.

## Scope of the conclusion

The scripted author is predetermined. This verifies instruction transport,
real tools and a usable technique, **not autonomous Luna judgment or measured
quality improvement**. Additional author-chosen checks may increase model cost;
no cost-neutrality claim is made. Installed scripted requests and developing-agent
work are accounted separately from historical Luna usage in [results](result.json).
Full platform CI and repository-wide `pnpm verify` are not inferred from targeted
checks; no project-wide toolchain is installed for this task.

The historical ledger evidence remains untouched: Q=false / T=true / D=false,
204/204 delivered project checks and 10/23 frozen independent checks. Actual
requests 45/49 contained the old truncation failure; successful edits 113/114
introduced the identity gate subsequently visible in M. This is evidence for
that specific compatibility split, not a common explanation or repair for
migration, remap, cutover, diagnostics or raw-ID defects. Historical M, reference
copies, scoring, expenses, Material UI, Svelte and unstarted slots are unchanged.

## Recorded result

One complete installed execution ran two scenarios with **26 local scripted
requests**: 20 author, four parent and two title requests. Each scenario used one
implementation stage and one author session, with zero repairs or extra attention
calls. Replacement took 13.042 seconds, preserved-contract 6.522 seconds; installed
execution plus capture took 19.860 seconds. No model inference or billed model
usage is represented by these requests. Developing-agent tokens/costs are not
available and are not added to historical Luna totals.

Replacement delivered a correct portable patch, but the unchanged workflow
status is **incomplete**: the diagnostic `node -e` failure remains uninterpreted,
and the new targeted `policy.test.cjs` route is outside the initial test inventory.
Its final full `node --test` passes; the old failure remains in history. Both the
portable project suite and separate public acceptance pass. Preserved-contract
ends **checks_passed** with the original mixed test intact. Neither status
certifies overall model quality. Exact limitations are retained in `result.json`.

The complete Linux controller suite (including command observations and native
lifecycle cases), prompt/control checks, template/materialization and separate
review checks all exited 0. Controller wall time was 42.735 seconds. Syntax and
scoped whitespace checks also pass. These are local targeted checks, not aggregate
CI or repository-wide `pnpm verify`; the latter was not run and no dependency
installation was attempted.

One preceding preparation attempt failed with Docker exit 125 because the nested
read-only dependency mountpoint did not exist in the export. It started no
OpenCode process and made zero scripted requests. The preparation correction
created that empty mountpoint only; collector, Git observation and transport were
unchanged. The final run verified all native tools and servers terminal before
removing its source container. The collector reported complete capture and zero
spill files; actual requests, tool receipts and reports were retained privately.
