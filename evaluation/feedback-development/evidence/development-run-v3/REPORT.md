# development-run-v3: no observed direct/D quality difference

One separately authorized pass completed on 2026-10-06: sixteen sequential native
attempts, sixteen normal completions and zero not_started or technical stops.
Direct and D each have **R=8/8, delivery=8/8 and Q=8/8** from the complete,
unmodified delivered patches and the existing contained offline evaluator.
All sixteen evaluations are proven; all eight pairs are measured. Candidate
wins/losses/ties/unknown are **0/0/8/0**, with delta Q **0 percentage points**.
This set detected no D advantage. It does not establish equivalence or superiority
over ordinary OpenCode; the comparison is D versus direct. Tasks were not made
harder after the results, and no confirmation, replacement, new model or default
strategy change followed.

| Task | direct R/Q; time | D R/Q; time | Pair |
| --- | --- | --- | --- |
| 01 invoice discount | PASS/PASS; 131.2 s | PASS/PASS; 192.5 s | tie |
| 02 CLI limit | PASS/PASS; 134.7 s | PASS/PASS; 147.7 s | tie |
| 03 wallet cancellation | PASS/PASS; 160.8 s | PASS/PASS; 222.2 s | tie |
| 04 invite redemption | PASS/PASS; 232.6 s | PASS/PASS; 220.8 s | tie |
| 05 query arrays | PASS/PASS; 177.0 s | PASS/PASS; 166.6 s | tie |
| 06 once events | PASS/PASS; 128.5 s | PASS/PASS; 169.4 s | tie |
| 07 config merge | PASS/PASS; 173.4 s | PASS/PASS; 152.0 s | tie |
| 08 option normalizer | PASS/PASS; 94.2 s | PASS/PASS; 105.4 s | tie |

Every row also has evaluationProven=true, delivery=true, providerConfirmed=true
and authorCompleted=true. The native internal status is incomplete in all sixteen
rows and is retained separately in [all sixteen records](results.json). Saved
current required npm test and git diff --check commands completed with exit 0;
coverage warnings ask for assessment of changed test scenarios. This internal
status does not override the independent scoring or normal author completion.

There were **zero native corrections** in either arm. The saved D0 correction
reasons are empty, and every D0.patch equals its final.patch byte for byte.
Required public checks were green before delivery. Thus no specific correction
can be credited with a gain, judged useless or blamed for a regression: the
correction mechanism was not exercised by these solutions. All eight pair
outcomes match, so there is no differing final result to explain. Saved checks
and patches, rather than hidden reasoning or another model, support this account.

| Participant | Requests | Input | Output | Cached subset | Reasoning subset | Native time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| direct | 183 | 2,252,139 | 50,246 | 903,168 | 24,515 | 1232.389 s |
| D | 167 | 2,003,477 | 59,971 | 803,840 | 27,646 | 1376.618 s |

Participant totals are **350 provider requests**: 16 title, 32 parent, 302 author
and zero correction. All have complete usage and completed, forwarded terminal
responses. Actual request model/effort are gpt-5.6-luna/high throughout; the saved
provider response lifecycle model ID is gpt-5.6-luna for all 350 requests. Input /
output totals are **4,255,616 / 110,217**. Cached **1,707,008** and reasoning
**52,161** are included subsets, never added again. **Money=unknown** without
billing. D used 11.7% more native time, 11.0% less input and 19.4% more output
than direct; these are descriptive costs of this fixed set.

Preparation took 13.406 s for direct and 9.908 s for D; independent grading took
3.818 s and 3.820 s, respectively. Per-row preparation, task, evaluation and
cleanup boundaries remain separate. Scripted fixtures have synthetic responses
and usage; development and CI are separately unmetered. Their infrastructure
cost is not mixed with participant usage. Host auth refresh calls were zero on
the current valid record; auth readiness made zero inference calls.

The ordinary OpenCode connection already existed. Its latest retained ordinary
assistant metadata records openai/gpt-5.6-luna and session version 1.18.26; the
current PATH binary is 1.18.34. Current CLI paths and the runner host resolve the
same accessible default XDG authorization file and openai OAuth record. That
record was updated at 09:28 UTC on 2026-10-06 after v2 and expires at 09:28 UTC on
2026-10-16; required access, refresh and account fields are present. No ordinary
process was running during inspection, so its historical process HOME/XDG cannot
be asserted. The old expired v2 diagnostic is not a current login diagnosis.
See the [authorization comparison](AUTHORIZATION.md).

The previous direct file reader bypassed native refresh. The host now reuses
OpenCode 1.18.26's unchanged auth.loader/refresh implementation with narrow store,
cancellation and local readiness bindings; pinned source hashes and its MIT
license are retained. Readiness passed before expensive preparation and before
admission/slot markers. Each frame rereads current auth and supports actual expiry
within the remaining task deadline; synthetic regressions verify refresh,
rotation, persistence, failure without expiry changes and cancellation. The real
pass did not need a refresh because access stayed valid. Participant credentials
are only the non-secret local relay key; host tokens, headers and account values
are neither mounted nor recorded. No login/logout or availability probe occurred.

The unchanged conditions are openai/gpt-5.6-luna, variant and model-level
reasoningEffort high; OpenCode 1.18.26; Node 24.19.0; 600 seconds per native task
including startup, title/parent, author/tools/public checks and native corrections.
Both arms use the same core, bundle, dependencies and immutable image, with extra
experimental flags off. Inputs, acceptance and controls match conditions head
779fb00ea8bab16e3e5da6695c76c622e70d26b0. Order remains direct,D; D,direct repeated
across eight tasks. The first inference belongs to slot 1. There were no retries,
substitutions, outside author continuations, reviewer calls or post-admission
changes to executable source, prompts, inputs, tests, scorer, order or budgets.

The pair-admission counterexample through report → summarize is retained in base
PR #32: one false win/seven ties/zero unknown/+12.5 pp before the fix becomes zero
wins/losses/seven ties/one unknown/null delta after it. Both rows need structured
proof and boolean R/Q; proven FAILs remain measured and absent money does not
make quality unknown. Diagnostic R and reasons remain available.

On final executable source the targeted auth/source/replay and aggregation checks,
npm run verify (21 groups), contained 24+6 preflight, exact-model scripted direct/D
(31 high-effort frames) and both deadline controls passed. Pinned host installed
verification had 39 scenarios on ee43fcb; native product/installed-check bytes were
unchanged in 5351a3b, whose fresh CI also passed installed and container checks.
The initial source CI failed its container job; a local short-budget regression
reproduced the fractional AbortSignal.timeout RangeError. One bounded fix rounded
the auth timeout down without extending budget, before real admission, and all
final checks passed. That failure is retained separately from participant results.
See [pre-run checks](pre-run-checks.json) and [protocol](PROTOCOL.md).

Both PRs' complete reviews/comments/replies were refreshed after the separate
seal was published and before admission: all nine base threads were resolved,
no candidate threads or new blockers existed. COMMENTED reviews are not merge
approval. The real canonical replay is now rejected before auth, without changing
its admission marker; old roots and copies are also rejected.

- Base PR #32 head: b7f9f1dce50139488254b12ea7924fa07b1ca084.
- Verified/reviewed executable source: 5351a3b642077a3541d4e734a3d818a487a9fa2c.
- Pre-run admission/seal commit: 654e23ed7981e55abf5ebc0acc65af8cfb77731f.
- Execution image: sha256:6ddc119af8a204548428504ef970a44640edfaa3238deacb558825ee25bce181.
- Private freeze SHA-256: 3280d1caf7f10c285ec946a478d33e361e11ef498bb821e80078752f5268c373.
- Public seal SHA-256: 99dd73b344a2a4ed5aa48ce64417424b8deae3d2efe1d25148954ac547ad0fe3.
- Bundle manifest SHA-256: 618db25cdf0bfac4ba3d3efa5abbbaaa7b15e2f4ada11214b27f959b2cced33a.
- Dependencies lock SHA-256: 9ddca616bb0cf944c76d6f12f6adb66fa937d39cd0274eb8d5ffa7555b954aba.
- Private raw report SHA-256: c0cf42ae7edb8d4cb7765e0152aa865ebaaa91d0aa9297ab4e6003833ccd3721.

[Base source CI](https://github.com/Tah10n/opencode-harness/actions/runs/37385767594)
and [final executable-source CI](https://github.com/Tah10n/opencode-harness/actions/runs/37449240643)
passed all three jobs on their recorded exact heads. Final evidence-publication
CI is checked separately through the current PR checks; its exact-head readback
is retained after publication. CI and model-free fixtures are not model lift.

All **284 historical v1/v2 files remain byte-identical**, including original
seals, markers, pauses, results and archives. All 154 frozen executable/source
files and all 350 complete request/response recordings passed integrity checks.
The private archive contains 3397 verified members, all complete patches and
source/fixture receipts, with no credentials or auth.json. Archive SHA-256:
**494bed382e8f7a0ac5186109a11a2b501b488f8e065ea422fa9bd3407b079bfe**; size **32,822,171 bytes**.
Full raw batch/recordings, markers, patches and grades remain outside Git;
compact receipts and upstream source retain native-auth provenance. The existing
verified historical environment archives preserve the same image/bundle/dependency
bytes, so no duplicate heavy environment archive was made.

Cleanup confirmed absence of 179 recorded own containers and 96 owned evaluator
temporary directories. It removed the restored image/tag (absent before this
work), assets, copied host OpenCode, dependency/cache trees and temporary fixtures:
**527.2 MiB allocated local files**. An earlier
unused restored cache removed another 14.0 MiB logical bytes, reported separately.
All initial foreign images and historical archives remain; no global prune or
Docker shared-layer size is added to the local removal figure. Retained v3 proof
occupies about 144.2 MiB, including a 107.4 MiB raw batch and 31.3 MiB verified
archive, because the real recordings are not reproducible evidence.

Both PRs remain open (#32 Ready, #33 Draft), and main remains unchanged. No main
merge, release, deployment or package publication was performed.
