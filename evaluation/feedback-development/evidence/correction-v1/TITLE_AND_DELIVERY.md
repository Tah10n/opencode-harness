# Exact-model title and scripted delivery correction

This corrective check uses local synthetic Responses only. Real credentials,
real upstream transport, availability probes and new development campaign
attempts are absent. The stopped run, execution seal, admission/pause markers,
full patches, results and private archives remain byte-identical.

The [compact receipt](installed.json) binds the contained preflight and actual
installed direct/D chain to source 43256165 and its preparation SHA-256. A later
safe-diagnostics-only change is separately identified; its targeted recovery
regression was rerun. Those older receipts prove their tested bytes only.
No real execution preparation was created.

## Before and after actual request formation

[OpenCode v1.18.26 request.ts](https://github.com/anomalyco/opencode/blob/v1.18.26/packages/opencode/src/session/llm/request.ts#L80-L91)
skips variant when input.small but merges model.options and agent.options with
smallOptions. The fetched source SHA-256 is
`a92010ff1981f9bdf62c7d2f6dcbe28baea041e2cd54bf0b54fd2ea667b92cf2`.
The minimal experiment-only correction adds model-level reasoningEffort=high
and retains variants.high.reasoningEffort=high. Native core and the shared
scheduler body guard are unchanged.

| Actual frame | Original experimental config | Corrected config |
| --- | --- | --- |
| Title | gpt-5.6-luna / none; boundary_refusal | gpt-5.6-luna / high (2 frames) |
| Bootstrap/parent | gpt-5.6-luna / high; blocked by pause | gpt-5.6-luna / high (4 frames) |
| Author | Not reached after refusal | gpt-5.6-luna / high (20 frames) |
| D correction | Not reached after refusal | gpt-5.6-luna / high (5 frames) |

The title is identified by the pinned title-generator developer message, not
tool absence. These bodies are emitted by installed OpenCode and checked by the
same scheduler before scripted transport. No post-formation effort rewriting,
none exception, title disabling or model alias is used. The historical config
counterexample refuses before auth/transport (both zero). Work frames with none
or another model still receive boundary_refusal before auth/transport.

## Native execution, delivery and independent evaluation

The one final contained preflight passes 30 task evaluations: eight retained
baseline/gold/wrong triples and six negative controls. Previous scorer,
read-only judge, completion, ordering and public-gold checks remain.

| Synthetic mode | R | delivery | Q | Corrections |
| --- | --- | --- | --- | --- |
| direct | false | true | false | 0 |
| D | true | true | true | 1 |

All 31 requests use the exact model/high configuration. Native public-feedback
correction, full-patch capture, independent contained grading and author/judge
isolation pass. The ordinary report resumes an interrupted evaluator directory,
preserves the completed direct evaluation and repeats with identical results;
neither author is rerun. Both separate five-second deadline fixtures issue the
hang, verify descendant termination/relay removal and retain delivery=false,
Q=false. Usage is synthetic and gives no effectiveness or efficiency result.

## Exact freeze and historical preservation

The existing verifyRealAdmission from 8b5609dd is reached before real credentials.
Regressions reject suite, task identity, paired source, order, permissions,
instructions, provider options, installed runtime/public input hashes and seal
mutations without duplicating this validator. Fixture/default paths stay
model-free. The old canonical campaign cannot be reused or resumed.

The four acceptance counterexamples, saved-score provenance/reentry, missing
bundle dependencies and recovery failure tests are described in the
[base correction report](REPORT.md). Ordinary project verification, hosted CI
and qualifying review approval remain separate facts reported on each PR.
Real provider requests for this entire corrective stage are zero.
