# Fixed 100-pair native task comparison — pre-run analysis plan

Preparation only. No scored run is authorized by this file alone; the complete
100-task corpus, validated references/negative/alternative checks, environment,
runner, candidate bytes, schedule and this analysis must be frozen before slot 1.
The user separately authorized exactly 200 task-runs. No interim stopping for
favorable results, replacement tasks, scored retries or post-result threshold changes.

Candidate: 3750b0d448fbfa7db80c459029a98fd221e86f94. OpenCode 1.18.26,
openai/gpt-5.6-luna low, 900 seconds per full task-run. A is plain; B is installed
full /harness-task, no imported D0/review. B retains two repairs, one evidence
correction and existing format limits inside that same deadline. Equal deadlines
are not equal compute. No model stage is required to produce findings or repair.

Primary endpoint is complete delivery under the task's pre-run rubric: required
behavior AND preserved behavior AND explicitly requested tests/docs. Unit = task,
not assertion. 25 tasks in each of four classes: multi-file integration, state,
API/consumer compatibility, behavior-preserving refactoring. These are compact
synthetic repositories, not a random sample of all production development.
Historical pilots/continuations do not enter this sample.

Let a = both complete, b = B-only, c = A-only, d = neither. n=a+b+c+d=100.
Primary effect = (b-c)/n; publish the full matched 2x2 table and all 100 pairs.
Primary test = exact two-sided conditional McNemar, alpha .05:
p=min(1,2 sum_{k=0}^{min(b,c)} choose(b+c,k) 2^{-(b+c)}), p=1 if b+c=0.
A claim of detected improvement needs positive point estimate and p<=.05.
The practical guide point estimate >= +.10 is separate; neither p<=.05 nor that
point estimate establishes a lower confidence bound exceeding +.10.

The preselected 95% confidence interval for the paired proportion difference is
Tango's efficient-score interval, without continuity correction, equations 24–26
and 33. The zero-discordance analytic limit is ±z²/(n+z²), equation 29. It is
not an independent-proportions interval or a degenerate resampling interval.
Source: [Tango (1998), Statistics in Medicine 17:891–908](https://www.site.uottawa.ca/~nat/Courses/csi5388/Tango.paired.pdf).
This score interval is approximate and is NOT the inversion of the exact
conditional McNemar test. E.g. b=5,c=0,n=100 yields an interval excluding zero
but exact p=.0625; retain both rather than changing methods after outcomes.

`statistics.mjs` implements these fixed methods. `verify-statistics.mjs` compares
10 independently computed tables, both marginal extremes at zero discordance,
reflection symmetry examples and boundary cases. Results are retained in
`statistics-controls.json`. For 100 pairs, P(B-only)=.20, P(A-only)=.05, exact
multinomial enumeration gives power .8367351211564439 (positive significant
branch .8367350635371916). The number of discordances is random, not fixed at
its expected 25. This is a planning assumption, not an outcome target.
Reference enumeration approach: [PASS paired-proportions technical documentation](https://www.ncss.com/wp-content/themes/ncss/pdf/Procedures/PASS/Tests_for_Paired_Specificities.pdf).

Secondary analyses: four task classes, partial improvements, B/D0→B/final,
post-D0 defects repaired/regressions, lost test coverage, unsupported reviewer
expectations, native status versus independent delivery, time/requests/tools/usage.
Do not use these to replace the primary endpoint or select a favorable subgroup.
Usage totals already include cache/reasoning subsets; never add them twice.
Unknown usage is unknown, including a provider error without observed usage.
An HTTP 503 does not erase a trustworthy final delivery after verified termination.

Grade A/final, B/D0 and B/final against the same frozen rubric after stopping all
model processes. Reviewer's verdict is never a grader. Ordinary project tests do
not substitute for independent acceptance/preservation. Manually assess meaningful
test/docs delivery and every explicit manualBehavior source criterion (where present) without exact test-name/reference matching, with arm and native
status hidden from inspection packets where feasible. A failed or unverified required manualBehavior item prevents primary complete, even when functional checks and tests/docs pass. These criteria come from visible TASK requirements (e.g. shared delegation or bounded retained state), never from matching reference internals. Independently review every
discordant pair and statistical calculation. B/D0 completeness can earn the win;
review-driven repair need not cause it.

Timeouts and ordinary solution errors retain their assigned slots. Grade a
trustworthy captured patch independently and publish timeout/native incomplete
separately. Absent trustworthy delivery is not complete. Missing D0 is unavailable,
never reconstructed as an invented successful state. Isolation loss, unverified
process termination or corrupt accounting stops affected execution and retains
partial evidence. Resume only never-started assigned slots when safety/accounting
is established, never rerun an existing scored slot. An incomplete 100-pair sample
has descriptive results only, no confirmatory verdict and no imputed zero effect.

Inference is conditional on these selected tasks, model and conditions. Task-level
pairing does not make near-duplicate scenarios independent; novelty review must
reject renamed variants before freeze. No claim of absence of all regressions,
universal effectiveness, full product readiness or automatic subsequent campaign.
