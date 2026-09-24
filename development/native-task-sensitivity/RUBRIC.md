# Diagnostic development rubric (before model outcomes)

Four deliberately selected unfinished patches, eight independent attempts.
Cases 1/2 are incomplete test deliveries; cases 3/4 are suitable prior controls.
Both H0 and H1 get identical original requirements, source, dependencies and seed
patch. H0's ordinary discovery and correct repair count in full.

Assess without relying on mutation scores or model summaries:

* Task 1: computed insertion preserves finite default TTL on a cache miss, cache
  hit/undefined behavior, expired entries, callback semantics, recency, failure
  atomicity, public types/docs. Delivered tests must distinguish lost default TTL.
* Task 2: removeWhere preserves configured capacity, including ordinary operations
  after filtering. Retain original order/indexes/duplicates/falsy values, atomic
  predicate failure, empty validation, wrapped storage, types and docs. Delivered
  tests must discriminate capacity loss, not merely inspect backing-array size.
* Task 3: same complete computed-insertion contract on the retained good patch.
  Preserve already correct behavior/tests/types/docs. Count unnecessary changes
  and new regressions. Other survivors do not by themselves invalidate the control.
* Task 4: same complete removeWhere contract on the retained good patch, with the
  same preservation and unnecessary-change accounting.

Q requires the entire delivered patch to satisfy the applicable original task,
ordinary project checks, meaningful regression discrimination, types/docs and
compatibility. A new empty-queue regression is useful but does not substitute for
the required configured-capacity check. D additionally requires normal installed
autonomous delivery, final native stop and verified termination/applicable patch.

Use fresh isolated copies for project commands and supplemental API/test
discrimination checks. Relevant assertion failures are distinct from import,
lint, compilation, environment and timeout failures. Preserve raw observations
and interpreted decisions separately. Check the final patch after its last edit.
Record actual sensitivity calls/observations and their connection to a delivered
API regression; availability without use is a valid system outcome.

Transfer gate: at least one additional complete H1 delivery compared with H0,
substantive use of the new observation, and no new regression on suitable
controls. Equal repair outcomes do not show an advantage. If this gate fails,
zero additional full-task P/H runs. If it passes, freeze four new tasks and their
rubric before any P/H results; at least two projects, implementation plus tests,
types/docs. Do not pool these development outcomes with historical H00 results.

Known local limitation fixed before outcomes: default-TTL loss is not encoded by
the selected standard operators in case 1's changed method. For case 2 an actual
survivor exposes invocation on an empty deque; strengthening the public test
rejects it. Neither observation establishes repair of the historical named gap.
