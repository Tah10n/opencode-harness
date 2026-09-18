# One permitted development revision: native tool admission

Recorded after all twelve v1 runs and their independent assessment, before any product edit.

- Unmet user outcome: H delivers only 2/6 complete patches versus P 6/6 (0 wins, 4 losses). None of the six H workflows completes without limitations; the legacy task reaches its total deadline. The behavior/coverage failures are recorded in results-v1.json and are not reclassified from status alone.
- Observed step: native authors submit multiple tool calls in one response. The plugin rejects a bash/edit call whenever another incompatible call is pending, before native execution. In catalog-cache, a legacy-consumer check and two final Git inspections are rejected; the author subsequently executes the same commands sequentially. Similar host-generated errors remain in every H run. They consume author interactions and pollute evidence. They are actual admission errors, not missing exit metadata.
- Why current logic does not remove the obstacle: before-tool admission throws instead of scheduling compatible native work. The model must discover the restriction and repeat calls; the observer correctly retains the resulting errors. Adding a status exception would not execute the interrupted work or recover the spent time.
- One change to test: serialize conflicting native tool admissions inside the existing workflow, retaining concurrent source reads where safe. Wait within the existing total deadline; cancellation/permission termination must release waiters without executing queued work. Snapshot checks still occur immediately before admission and after execution. Do not change H1, author/correction prompts, stage count, observation criteria, permissions, model, effort or budget.

This addresses a confirmed execution obstacle. It does not directly repair the four semantic delivery failures and does not promise a quality gain. After local regression checks, installed scripted execution and one review, freeze this sole revision and run all six P/H pairs fresh. The first series stays intact. A nicer status alone will not count as improved code quality. No third version or extra model attempts.

The separate long one-line tool-result truncation remains recorded; changing presentation is not part of this revision.
