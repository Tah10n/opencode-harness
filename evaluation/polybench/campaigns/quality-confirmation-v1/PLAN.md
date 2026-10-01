# Quality confirmation: pre-registered conditional independent evaluation

This plan is fixed before any new development outcome. It is conditional on a
candidate passing the separate six-task development screening. It does not
authorize an incomplete party, a retry, a third candidate or automatic
continuation after a new stop. Maximum 60 fresh task-runs, 30 P/H pairs.

## Metadata-only selection and separation

Dataset: AmazonScience/SWE-PolyBench_Verified at
`b3fca77b637379f0c01ad86d18753a7ac1998b53`; CSV SHA-256
`0c8138e73c34fa29a5276b675b146b72d78ce001fcc4560d76302c908b4808a5`.
Official evaluator: amazon-science/SWE-PolyBench at
`9c836c5d7f3cb991934132b77d29e6941d912a07`.

Selection uses only instance_id, repo, language, task_category and base_commit.
Exclude the union of all selected IDs in the historical pilot and both
consolidated selections, including their preparation exclusions and all six
development IDs. Their source paths/hashes and each exclusion are recorded.
The indexed older PolyBench diagnostics used IDs from the pilot selection;
unexecuted reserve lists are not treated as used tasks.

Use seed exactly `opencode-harness-quality-confirmation-v1` (no newline).
Order eligible JS/TS metadata by SHA256(seed + instance_id), then instance_id.
Use existing select_campaign Hamilton category allocation within each language
with 15 per language and a global maximum six per repository. Select the
lexicographically first feasible hash-ordered sequence meeting those quotas.
Thirty tasks under this cap necessarily span at least five repositories.

From the remaining hash-ordered pool take the first five of each language;
combine and sort by the same key to obtain ten fixed reserves. For technical
replacement, visit invalid primary positions in their frozen order and take the
first still-unused reserve with the same language whose insertion retains the
repository cap and at least five repositories. Do not change the pool or order.
Record every invalidity and rejected reserve/cap reason. Category stratification
is the initial selection rule; replacements preserve language and repository
bounds. Only objective common baseline/gold/environment failure before the
first confirmation model request permits a replacement. A candidate-specific
failure does not. If 30 valid tasks cannot be prepared, do not start a partial
confirmation. After the first model request no replacement is allowed.

Before selection of H, do not inspect these tasks' statements, source, gold,
tests or results for development. After selecting and freezing H's exact
source/bundle/config hashes, prepare the fixed pool with model-free controls.
Preparation findings never authorize changing H. Pair order alternates P-H,
H-P by final primary position; one sequential attempt per task/arm.

## Execution and endpoints

P is ordinary OpenCode with normal public tools; H is the selected native core
through the same materializer/configuration measured in development. Equal
public inputs/dependencies/environment, OpenCode 1.18.26,
openai/gpt-5.6-luna high, 1,800 seconds TOTAL including startup, parent/title,
model/tools, any normal delegation, checks and terminal delivery. No paid
availability probe, parallel resource competition, manual help, cross-arm
feedback or evaluator feedback to sessions. Preserve isolation/network bounds,
frozen-input validation and finite recording quotas.

For every attempt retain R (official resolved), T_delivery (autonomous native
delivery and verified stop), D = R AND T_delivery (primary), exact complete M
including author tests, terminal/partial artifact, applicability/tree comparison,
preparation/evaluator errors and capture/usage completeness. Do not change the
official evaluator, parser, commands or test_patch/M application order. Unknown
provider outcome, auth/quota, capture incompleteness or unverified stop closes
admission; the remainder is not_started and confirmation is incomplete. No
product changes, new versions, limit increases, retries or favorable early stop.

## Fixed statistical analysis

The unit is a task. For D and separately R, report paired wins (H only), losses
(P only), ties, counts/rates and (wins-losses)/n in percentage points. The primary
test is two-sided exact McNemar on D, alpha = 0.05: twice the binomial(n=w+l,
p=0.5) lower tail through min(w,l), capped at one; no discordances gives p=1.
R is secondary and descriptive; do not switch the primary endpoint.

The 95% difference interval is the conservative simultaneous exact-binomial
interval: compute 97.5% two-sided Clopper-Pearson intervals [Lw, Uw] and [Ll, Ul]
for wins/n and losses/n, then report [Lw-Ul, Uw-Ll]. Each marginal uses 0.0125
per tail; Bonferroni ensures at least 95% joint coverage regardless of dependence.
This deliberately conservative interval stays nondegenerate for all ties. Fix
and computationally verify the implementation before confirmation results; never
replace it after seeing outcomes. The exact-binomial definitions follow
[SciPy's Clopper-Pearson documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats._result_classes.BinomTestResult.proportion_ci.html)
and [statsmodels' exact McNemar documentation](https://www.statsmodels.org/stable/generated/statsmodels.stats.contingency_tables.mcnemar.html).

Show leave-one-repository-out D/R differences and primary p-values/intervals;
these are sensitivity analyses, not independently selected winning subsets.
Repository-dependent tasks do not establish transfer to every project class.
Thirty tasks may lack power for a modest effect. A positive uncertain signal is
unconfirmed; all ties do not establish equivalence.

Confirmation requires ALL: 30 trustworthy measured pairs; at least three net
additional D (>=10 pp); positive difference supported by the fixed two-sided
test at alpha .05; H autonomous deliveries >= P; preserved technical/safety
properties; complete disclosed additional expense; no leakage or condition
substitution. Count all requests/input/output, including parent/title/children,
cached/reasoning as included subsets and unknown usage, with actual times.
No guessed monetary cost. Separate preparation/evaluator/CI/developing-agent
effort and never pool development, confirmation or different H versions.

On success recommend exactly the measured version, limited to this model and
JS/TS benchmark class, through ordinary installation. On failure/uncertainty
keep the candidate out of the recommended/default product, publish every
outcome and the bounded disposition, and start no further automatic experiment.
