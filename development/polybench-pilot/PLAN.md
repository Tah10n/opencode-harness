# SWE-PolyBench Verified pilot v1

Preparation only until gold, genuine baseline, author isolation and scripted
preflight pass for all ten instances. No provider probes or replacement runs.
Measured runtime: e18db1fe10223db52dcc05b3e769bca140367c2b.
Evaluator: 9c836c5d7f3cb991934132b77d29e6941d912a07.
Dataset: AmazonScience/SWE-PolyBench_Verified at
b3fca77b637379f0c01ad86d18753a7ac1998b53 (test.csv).

## Selection rule (before controls or model requests)

Only metadata participates. Sort the 200 JavaScript/TypeScript rows by SHA-256
of UTF-8 `opencode-harness-polybench-pilot-v1\n` + instance_id (ID breaks ties).
Choose the lexicographically earliest feasible subsequence with exactly five
of each language, exactly three Bug Fix, one Feature and one Refactoring per
language, at most three per repository and at least four repositories. Use
backtracking to preserve feasibility; never inspect patches for selection.
The full hash order is the reserve order. A technical exclusion must record
evidence before rerunning the same rule on remaining rows. Only unavailable
images, incompatible architecture, unreproducible gold or genuine baseline
permit exclusion. No exclusions after final freeze / first model request.
Unsupported TYPE_COMPAT and model outcomes never permit exclusion.

After preparation, sort selected IDs by the same hash and assign cyclic arms:
P/H0/H1; H0/H1/P; H1/P/H0. Exactly 30 single-attempt slots, 1800 seconds each,
OpenCode 1.18.26, openai/gpt-5.6-luna, high. No model requests before a local
freeze commit. All seven optional switches off except H1 TYPE_COMPAT; direct
runtime unchanged, TypeScript 6.0.3 returned-callable-strict-v1, 2 x 60 seconds
and 120 seconds total inside deadline. P is native plain build. Offline tools;
existing auth/transport/admission/cancellation policy remains unchanged.

Official resolved R is primary; autonomous applicable patch and verified stop
is T; D_bench = R and T. Unknown evaluations and not_started remain unknown.
No hidden evaluation feedback, patch repair, retries or continuation after
admission closure. Report every assigned slot and paired outcomes, repository
sensitivity, costs and compiler receipt/repair chain separately. No default
change or follow-on campaign, regardless of outcome.

Official tests/parser/scoring remain external and unchanged. Pin GHCR digests,
forbid latest/local-alias substitution and fallback builds. Separate author
archives and dependency trees from evaluator, gold/test patches, Git history,
logs, credentials and other attempts. Run gold first on one JS and one TS,
then remaining controls, including real test_patch-only baseline tests.

Upstream sources: https://github.com/amazon-science/SWE-PolyBench and
https://huggingface.co/datasets/AmazonScience/SWE-PolyBench_Verified.
Upstream repository LICENSE is MIT; source headers also state CC-BY-NC-4.0.
Preserve both notices without resolving that discrepancy by assumption.
Dataset card declares MIT. Public benchmark tasks are not guaranteed unseen.
