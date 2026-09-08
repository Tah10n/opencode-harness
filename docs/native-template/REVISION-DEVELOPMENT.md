# Published native revision: second development batch

Pre-run plan, 2026-09-08. Candidate commit:
`1d79ce9e87b43c156f132e59acd5fce1df706814`.
Use its exact profiles/native/core.md bytes without changing instructions.
Previous six outcomes remain immutable, separate development observations.

Six fresh native sessions, one per task/arm, no retries or intervening messages.
Order: collectors off/on, ledger on/off, Cursor off/on. Same previous prepared
source trees, task bytes, AGENTS.md, native tools, access and environment.
Binding: OpenCode 1.18.26, openai/gpt-5.6-luna, low, 900 seconds each.
The existing isolated development transport is reused unchanged. It is not
installed in the product. One local scripted smoke checks the full instruction
text, project instructions, native build tools, model and project permissions.
No real provider is contacted by that smoke.

The existing local journal stores bundle/task/tree/config hashes, exact commands,
patches and material events. No new manifest protocol or signature system.
Agents receive only original prepared source/tests/task and (on) the candidate
instructions. They cannot access reports, counterexamples or reference fixes.

Obligations and completion rules remain those in the first batch:

| Task | Required behavior and delivery |
|---|---|
| Collectors | All six non-Codex consumers fail closed on malformed/unsupported usage; retain accepted days and committed state; provisional unterminated append/rewrite retries; preserve valid totals/components, dedup, bounds, APIs, privacy and unrelated records. |
| Ledger | Accepted events survive copy/move/truncation/DB deletion; replay deduplicates and new events count; conflicts retain first tuple and allow unrelated events; bounded private storage, conservative old-state migration, all adapters and persistence; exact cutover remains fail closed. |
| Cursor | Stable same-major Desktop and dated CLI from the specified floors; parser, CLI capture/account routing tests and docs; preserve rejection boundaries, counters, identity/completion, dedup and immutable capture time. |

Assess separately: A required behavior/preservation, B correct shipped project
regressions, C complete delivery including explicit tests/docs, D observed workflow
(test timing, original-defect sensitivity, checks after final edit). D is diagnostic
and never substitutes for A/B/C. Existing frozen probes and the already documented
portable/consumer examples provide independent behavioral evidence; their bytes
are fixed before attempts. Original suites are overlaid for preservation only.
New test expectations require task/public-contract justification. Test sensitivity
is checked on separate original-source copies; import errors are not bug detection.
Any adequate test of the obligation is accepted; no exact evaluator-test matching.

Retain infrastructure/evaluator failures without retry, silent repair or attribution
to the model. Report incomplete auxiliary usage accounting separately from main
input/output/cache fields; monetary cost is unavailable. Three reused tasks cannot
establish general lift. No next revision, new evaluation, merge, release or default
change is authorized by this batch. Results will be appended to this same PR.
