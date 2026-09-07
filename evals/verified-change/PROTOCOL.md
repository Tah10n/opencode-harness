# Verified-change final evaluation protocol — draft, not frozen

No final evaluation outcome has been observed. This document is a proposal to be
reviewed with the corpus and runner before one immutable evaluation manifest is
written. It does not authorize substitution of a new dataset after outcomes.
Historical PR #21/#22 and all development cases are excluded.

## Population and dependence

Create 60 fresh synthetic repository tasks in 20 repository families. Each family
contributes one public reproducer/bug task, one request whose old tests are green,
and one multi-file compatibility/consumer/failure-path task: 20 in each stratum.
The three tasks in a family start from their separately recorded public bases and
are dependent observations. Family, not task, is the inference unit. Families
must represent different systems/obligations, not renamed copies of one function.

Every task needs public source/tests/docs, a visible request, independent hidden
acceptance and regression tests, a reference implementation, and an independently
implemented valid alternative. Alternative solutions cannot wrap or mechanically
rename the reference. Before freeze, both implementations must pass the exact
installed check path and a known-invalid implementation must fail it. The hidden
grader is written from public contracts independently of harness-generated tests;
the product never receives graders, references, family labels or task IDs.

## Arms and limits

Use the previously verified development binding openai/gpt-5.6-luna, low; verify
availability again before freeze. Do not hardcode it in the product.

For each task generate exactly one plain D0 in an isolated ordinary OpenCode
session. All ordinary repository tools and public tests are available. Save its
patch bytes and fingerprint, then start two independent extra-work sessions from
that same D0 and the original public requirement:

- A is the unchanged D0.
- B gets another plain opportunity to inspect the request, consumers and public
  tests, and correct its draft. It receives no generated acceptance tests.
- C runs the installed harness with the original base and `--draft-patch D0.patch`.
  The independent author finishes against the original base before D0 import.
  The primary repair session is fresh, like B's extra-work session.

If no timely completed, scope-valid D0 can be snapshotted, do not start B or C.
Record all three arm outcomes as zero, with `upstream_draft_unavailable` for B/C,
retaining the original A cause. Do not substitute a partial or empty draft and do
not retry A. Preserve any partial patch privately for diagnosis.

Planned limits are 300 seconds for D0 and 600 seconds of additional work for each
of B/C. C's 600 seconds includes authorship, its audit, host checks, assessment and
up to two repairs; it is not 600 seconds per role. The product's per-prompt limit
will be no larger than the arm deadline. B receives the same upper wall-time
allowance. The C deadline starts after product preflight; B starts before its clone/session
preparation. Total arm wall time includes preflight and process/container cleanup,
but these phases are not separately timed. Report this small setup asymmetry
explicitly rather than claiming exactly equal end-to-end deadlines. The installed runtime does not enforce an equivalent hard token or
monetary cap: do not describe spending as equal. Record actual wall time, steps,
tool calls, tokens/cache tokens and provider cost metadata where available;
zero cost metadata does not establish free execution. Interrupted prompt usage
may be unavailable; completed-prompt totals are then only observed partial usage.

Balance B-before-C / C-before-B at 30 tasks each using a fixed order committed in
the manifest. No concurrent mutable sessions/workspaces; B never sees C outputs.
A timeout, ambiguous provider submission or completed result is never retried.
Record infrastructure errors explicitly, retain every task in the 60-row results
and report their impact rather than silently excluding or relabeling them.

## Outcomes

For every arm, success requires all independent hidden acceptance tests, all
mandatory regressions, permitted source scope and an obtained result within its
arm deadline. Product-generated tests and review opinions never determine success.
Retained D0 after unsuccessful C repairs is scored as D0 when the arm completed
in time; a timeout remains unsuccessful even if a useful draft file survives.
Retain private patches and bounded actual failing diagnostics, not only hashes.
Every arm has a binary operational success: only an established success is 1;
timeout, scope violation, incomplete response, unavailable upstream draft and
grader infrastructure failure are 0 with their distinct original causes. A grader
infrastructure error is not attributed to candidate semantics. Validated frozen
Node test imports that fail to parse/link candidate source, or structured test
callback failures whose stack originates in /workspace/src, count as measured
candidate failures. Preserve the original product check status and separate
evaluator interpretation. Other unresolved runtime/grader failures stay unavailable. Any unavailable
required grading or isolation verification keeps an efficacy claim unproven, even
if aggregate thresholds would otherwise pass. There is no exclusion or retry.

Publish A/B/C counts and rates over all 60; C-A and C-B differences; won/lost pairs;
conditional recovery among A failures; observed regressions among A successes;
timeouts, infrastructure/isolation/scope/user-worktree incidents and actual cost.
Inspect and explain every discordant pair without changing its frozen grading.

## Prespecified analysis proposal

For a comparison, let d_f be the average of the three paired binary success
differences within family f. The estimate is mean(d_f), equal to the 60-task
paired rate difference because family sizes are equal. Compute a two-sided 95%
Student t interval using the sample standard deviation of the 20 family means,
standard error s/sqrt(20), and t(19,0.975). This is a cluster-level approximation,
not an exact distribution-free interval. If sample variance is zero, report the
interval as uninformative/unavailable for inference rather than claiming exact
equality from a collapsed interval; the target is then not established.

For the prespecified primary difference test, use the two-sided paired t test on
these 20 family means, H0: E[d_f]=0, with statistic mean(d_f)/(s/sqrt(20)) and 19
degrees of freedom. This uses the same independent-family, approximately normal
mean/variance assumptions as the interval; 20 families do not establish them
automatically. The p-value is approximate for this discrete synthetic population,
not an assumption-free exact test. Zero sample variance makes this test
uninformative/unavailable and the target unestablished.

Independent pre-outcome review identified that an originally proposed sign-flip
enumeration tests a stronger symmetry/exchangeability null, not merely zero mean.
The protocol therefore uses the matching cluster-level t interval and t test,
without selecting among inferential methods after outcomes. Also publish
task-level exact McNemar from discordant counts as a nominal descriptive
diagnostic, explicitly not the primary test because within-family pairs depend.

Primary comparison is C-A. The target requires an estimate at least +10 percentage
points, a positive lower bound of the prespecified interval, primary p<0.05, and
no isolation violation or user-worktree corruption. Only after the primary target
passes evaluate the stronger C-B superiority claim with its positive lower bound
and p<0.05 (hierarchical testing). Otherwise describe C-B estimates without claiming
superiority. Do not choose another interval/test after seeing results.

This estimates performance on these specified complex repository tasks, not all
programming requests or real-world production repositories. Keep simple local
regressions separate. Common authoring conventions may cause additional
cross-family dependence; disclose this limitation.

## Freeze and publication

Before the first outcome, record candidate commit, installed bundle hash, runner
commit, all task IDs/public bytes/grader bytes/reference and alternative bytes,
model binding, exact arm instructions, limits/order/retry and analysis method.
Obtain independent code/statistical review before execution. A locally committed
manifest plus private immutable inputs, hashes, patches and attempt journal is
sufficient; no signing, custody, epochs or global experiment registry.

Run once. Publish the full main-set report even if the target is not met. Open one
PR containing the product, demo, tests, frozen manifest, A/B/C results, all
discordant analyses, limitations and reproduction commands. No merge, release or
default-profile switch is authorized by this protocol.
