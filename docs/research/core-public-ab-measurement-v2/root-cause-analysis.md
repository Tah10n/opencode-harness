# Core-public A/B v2 offline root-cause analysis

This analysis is read-only with respect to the historical campaign. It uses the
120 validation receipts published by the campaign process at PR #21 head
`3c2d51b9e6d000b0a4aec49e158b18af7eb181af`. No model or provider call was
made, and the historical ledger and receipts were not changed.

## Conclusion

**MEASUREMENT UNINFORMATIVE — COMPLETE FLOOR EFFECT**

The floor had two independent causes:

1. Both arms produced allowed, syntax-valid edits that failed the task semantic
   oracle for all 60 families. The retained receipts do not contain the patch
   bytes or the failing assertion, so they cannot support a more specific
   model-error diagnosis.
2. Every core attempt was additionally blocked by a broken host-check runtime.
   The benchmark copied a dynamically linked Homebrew Node executable as a
   single file. The copy cannot load `@rpath/libnode.137.dylib`, aborts before
   checking the source, and is reported by the old aggregate as a generic
   verification failure.

The old core also had no remediation path: the host check ran after OpenCode
had exited, its stdout and stderr were discarded, and no continuation returned
the result to the model.

## Receipt classification

The categories below are exclusive. Core rows use the first causal blocker;
the overlapping semantic-oracle signal is reported separately.

| failure_category | plain_count | core_count | representative_examples |
|---|---:|---:|---|
| model did not change files | 0 | 0 | none |
| wrong files changed / mutation scope invalid | 0 | 0 | none |
| syntax failure | 0 | 0 | none |
| public verification failure caused by broken check runtime | 0 | 60 | `v3-validation-small-01/core`, `v3-validation-high-02/core` |
| semantic hidden-oracle failure after syntax-valid edit | 60 | 0 | `v3-validation-small-01/plain`, `v3-validation-high-02/plain` |
| protocol or final-response failure | 0 | 0 | none |
| provider failure | 0 | 0 | none |
| configuration or tool restriction | 0 | 0 | none |
| other | 0 | 0 | none |

Overlapping signals are important: all 60 core edits also failed the semantic
oracle. Across both arms, all 120 attempts changed files, all 120 changes were
inside the allowed scope, all 120 passed the runner's independent syntax check,
all 120 had a valid OpenCode protocol and exit status 0, and all 120 failed the
semantic oracle. There were no timeouts, provider failures, configuration
drift, catalog drift, hidden-data leaks, or reconciliation cases.

## Core verification failures

All 60 core outcomes have the same classification:

| Field | Classification |
|---|---|
| selected check | `core-public-ab-syntax-all` |
| check command | copied trusted Node plus an inline `node --check` loop over the changed subject paths |
| applicability | path-applicable to every changed file, but only a syntax sensor; it did not test the visible behavioral requirement |
| original exit evidence | the compact outcome receipt retained only `core_verification_status=failed`; the check subprocess stdio and exact signal were discarded |
| reproduced disposition | `status=unrelated_infrastructure_failure`, `detail_code=check-infrastructure-failure`, no integer exit code, terminating signal `SIGABRT` |
| reproduced stderr category | macOS dyld loader failure: missing `@rpath/libnode.137.dylib` beside the copied executable |
| visible to model | no; the check ran after the OpenCode child completed and its stdio was ignored |
| correction opportunity | none; the old runtime never continued the same session |
| causal role | an independent terminal block, not a consequence of the patch; the semantic oracle would also have failed the retained patch |

The copied executable has SHA-256
`c8eedc7651a438fb7d2ceb36fd70032676c855586a36c950ba5a662f0b7853bd`.
A model-free reproduction applied the exact reference source for
`v3-validation-small-01` through the materialized core. The child edit exited
0 and matched the reference bytes, but core returned exit 20 with
`verification_unrelated_infrastructure_failure`. This disproves any claim that
the 60 core verification failures measure patch quality.

## Manual task audit

The historical runner intentionally deleted each model workspace and private
attempt directory after scoring. It retained only changed paths, aggregate
process facts, and hashes of stdout, stderr, and oracle results. Consequently,
the exact model patches and exact failing assertions are not recoverable from
the 120 receipts. The table states that evidence limit instead of fabricating a
patch. It still audits three tasks per stratum against the visible contract,
reference fix, hidden test, and receipt footprint.

| Task | Visible requirement | Retained model-patch evidence | Why the oracle did not pass | Solvable from visible information? | Oracle aligned? |
|---|---|---|---|---|---|
| small-01 | do not report a shadowed `undefined` in `no-throw-literal`; exact public example supplied | both arms changed only `lib/rules/no-throw-literal.js`; patch bytes unavailable | both syntax-valid edits failed the upstream rule test; exact assertion unavailable | yes; full source and the decisive shadowing example were visible | yes; hidden test contains the disclosed example and pre-existing rule cases |
| small-02 | report the complete end location in `one-var-declaration-per-line`; expected columns supplied | both arms changed only `lib/rules/one-var-declaration-per-line.js`; patch bytes unavailable | semantic rule test failed; exact assertion unavailable | yes; required location shape and examples were explicit | yes; upstream rule test directly exercises the disclosed locations |
| small-03 | export `includeIgnoreFile` from `eslint/config`; exact API assertion supplied | both arms changed only `lib/config-api.js`; patch bytes unavailable | semantic config API test failed; exact assertion unavailable | yes; export name and assertion were explicit | yes; hidden test checks the disclosed export and existing exports |
| medium-01 | check both `?` and `:` spacing even when the first operator is reported; expected fixes supplied | both arms changed only `lib/rules/space-infix-ops.js`; patch bytes unavailable | semantic rule test failed; exact assertion unavailable | yes; multiple concrete inputs, diagnostics, and outputs were visible | yes; upstream test is the disclosed behavior plus preserved cases |
| medium-02 | add `allowInParentheses` behavior to `no-sequences`, including default and false cases | both arms changed only `lib/rules/no-sequences.js`; patch bytes unavailable | semantic rule test failed; exact assertion unavailable | yes, though materially larger; option schema and boundary cases were visible | yes; hidden cases correspond to the disclosed option contract |
| medium-03 | prevent ASI-changing `no-unused-labels` autofixes for unsafe leading tokens | both arms changed only `lib/rules/no-unused-labels.js`; patch bytes unavailable | semantic rule test failed; exact assertion unavailable | yes; unsafe tokens, safe boundaries, and semantic hazard were described | yes; upstream cases exercise the stated ASI boundary |
| high-01 | improve `new-cap` report location to the identifier; expected locations supplied | both arms changed only `lib/rules/new-cap.js`; patch bytes unavailable | semantic rule test failed; exact assertion unavailable | yes; source and expected spans were visible | yes; the hidden test checks those public spans and preserved behavior |
| high-02 | avoid false positives for references that resume through `finally` paths | both arms changed the two allowed code-path analysis files; patch bytes unavailable | semantic `no-useless-assignment` test failed; exact assertion unavailable | yes but difficult; full related source, control-flow cases, and allowed files were present | yes; hidden cases are the disclosed try/catch/finally behavior and existing suite |
| high-03 | add safe autofix behavior to `multiline-ternary`, preserving comments | both arms changed only `lib/rules/multiline-ternary.js`; patch bytes unavailable | semantic rule test failed; exact assertion unavailable | yes but broad; outputs and comment exception were visible | yes; upstream test directly encodes the supplied outputs and no-fix comment case |

## Model-free go/no-go decision

The old v3 validation set is not repaired or reused for the new measurement:

- its configured public check was only syntax and did not check part of the
  target behavior;
- the exact reference patch fails through the historical materialized core
  because the check executable is incomplete;
- the old runtime cannot return a failed check to the model or permit one
  correction;
- retained evidence is insufficient for exact patch-level retrospective
  diagnosis.

The replacement is therefore a small, independent core-lite corpus. It must
pass broken/reference/alternative/public/hidden/workspace/runtime gates before
any development model call.
