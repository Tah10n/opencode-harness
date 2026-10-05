# Proven pair admission

The eight-pair counterexample on `ba78761426c21a2a70f7b86724ff3c522ecf1ff5`
went through the real offline evaluator, saved-evaluation reader, `report` and
`summarize`. Seven pairs had identical proven PASS results. In the remaining
pair D had proven PASS, while direct retained diagnostic R=true but its saved
evaluation had `cleanupVerified=false`. Reporting correctly emitted R=null,
evaluationProven=false and conservative Q=false, but aggregation counted that
row as a measured loss.

| Aggregate | Before | After |
| --- | ---: | ---: |
| Candidate wins | 1 | 0 |
| Candidate losses | 0 | 0 |
| Ties | 7 | 7 |
| Unknown pairs | 0 | 1 |
| Delta Q, percentage points | 12.5 | null |

Admission now requires both rows to have evaluationProven=true, boolean R and
boolean Q. Diagnostic R and the original reason remain available. Proven FAIL
is measured, including FAIL/PASS, PASS/FAIL and FAIL/FAIL; neither Q=true nor
monetary billing is required. Missing and duplicate rows remain unknown.

`node evaluation/feedback-development/verify-report.mjs` passes the full reader
path for unknown direct, unknown D, both unknown, absent grading, real failed
patches, repeated reports and missing/duplicate attempts. The synthetic metadata
fixture uses real Node test/reporter output and synthetic containment records;
it proves reader/aggregation behavior, not actual containment or model quality.
Existing diagnostic-binding and atomic-reentry checks remain. The ordinary
verification retains the measured win/loss/tie regression with explicit proof
fields. No acceptance, scorer, runtime, strategy, budget or provider guard changed.

Historical development-run-v1 evidence is preserved without reclassification or
reevaluation. This regression makes no real provider request.
