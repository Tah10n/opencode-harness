# Core versus plain model-backed measurement methodology

This measurement estimates the paired change in regression-free task success
for the already-published materialized `core` profile. It is not a promotion
authority, a new benchmark epoch, or a model-independent evaluation.

## Frozen surfaces

- Product source: `89f1f7f1980a829d7da162fcd737d0c52613225d`.
- Candidate: the byte-verified materialized core bundle from that source.
- Model binding: `openai/gpt-5.6-luna`, variant `low`.
- Primary data: the existing 60 validation families, balanced 20/20/20 across
  small, medium, and high.
- Sensitivity data: the existing 60 development families.
- Real-repository pilot: the exact 29 independent epoch-2 identities, with
  repository counts 8/1/12/8 and strata counts 10/10/9.
- One deterministic counterbalanced schedule is frozen independently within
  each dataset and stratum.

The manifest binds the runner, published benchmark input bytes, candidate,
OpenCode executable, runtimes, tasks, pilot controls, schedule, timeout, retry
policy, evaluator, and statistical method before the first model call.

## Pre-execution safety block

The published benchmark v3 controls contain task-specific hidden semantic
oracles and frozen `unclassified` defect severity, but no independent frozen
oracle that detects and classifies new HIGH/MEDIUM/CRITICAL regressions. A zero
classified-regression count would therefore be absence of evidence, not the
required `no new HIGH/MEDIUM/CRITICAL regression` evidence. The runner refuses
to freeze a campaign while this surface is unavailable, before any model call.
Replacing the requested primary metric with a narrower semantic-oracle proxy
would require an explicit contract change and is not performed here.

The source audit is exhaustive for the frozen inputs: all 120 public controls
have `defect_severity: unclassified`; their only runner witness is the
task-specific semantic oracle plus closed mutation set. The 29 signed pilot
identities contain no severity, finding, regression, safety-oracle, or other
classification field. The repository's paired-defect evaluator only compares
already-supplied structured findings; it does not discover them. Its blinded
archive is explicitly calibration-only and non-confirmatory, so it cannot be
substituted as campaign safety evidence.

## Arm equivalence and isolation

Both arms receive identical task bytes, prompt, model, provider, variant,
OpenCode executable, model-execution timeout, evaluator, and hidden oracle.
The plain arm receives an empty standard configuration. The core arm receives
only the exact materialized core configuration.

Shell, web, delegation, external-directory access, and question tools are
denied in both arms. Provider traffic is mediated by a host-side proxy over one
attempt-private Unix-domain socket. The model sandbox has no TCP, UDP, DNS, or
other Internet egress. OAuth material remains in the host process; the model
receives only a single-use proxy capability, consumed from an owner-private
file and erased before task execution.

Hidden tests, reference repairs, paired-arm output, evaluator results, and
provenance history are never placed in the model-visible workspace. After the
model process group is terminated and verified absent, the model workspace is
copied to a fresh random oracle workspace that was never present in the model
sandbox profile; the original workspace and provider proxy are removed before
hidden controls are staged. The oracle runs without network access.

## Attempts, resume, and evidence

Every attempt has a content-bound start event and terminal event in a durable
hash-chained append-only ledger. Receipts bind the frozen manifest, pilot
manifest, task, arm, attempt index, and retry predecessor. Reporting recomputes
receipt fingerprints and requires exact agreement with the ledger receipt
hashes.

One retry is allowed only for a durable, proven infrastructure failure before
any scored outcome: either a host failure before physical provider submission,
or an observed provider 429/5xx response that produced no task mutation or
passing oracle. An uncertain provider submission is reconciliation-owned and
cannot be retried. Timeouts, model protocol failures, failed oracles, core
verification failures, and every scored outcome are final. An owner-bound
campaign lease prevents concurrent resume against one campaign ledger.

Raw stdout, stderr, task workspaces, private controls, credentials, and OAuth
state are not published. Private receipts retain bounded counts, provider
status evidence, and content hashes; the committed attempt-hash ledger binds
the private receipt archive.

## Scoring and inference

Regression-free task success requires a passing behavioral hidden oracle, no
scope violation, passing syntax verification, no timeout, authentic exit-zero
process completion, valid model protocol, and (for core) authentic passing
post-mutation verification. Host verification failure is a core failure.

Public benchmark severities remain unchanged. They are `unclassified`, so
HIGH/MEDIUM/CRITICAL rates are reported as not observable rather than inferred.
Any plain-only success in an unclassified family is conservatively reported as
an unclassified semantic regression and prevents an improvement label. A
positive primary effect also cannot receive the improvement label when no
HIGH/MEDIUM/CRITICAL safety coverage is observable; reporting fails closed.

Primary inference uses exact two-sided McNemar, a predeclared one-sided exact
test in the core-greater direction, and a deterministic 100,000-resample paired
bootstrap with a frozen seed. Development and pilot statistics are descriptive
and are never pooled with primary inference.

The allowed labels and thresholds are those recorded in the frozen goal:
`CORE IMPROVES ON PUBLIC VALIDATION BENCHMARK`, `NO CLEAR MEASURABLE
DIFFERENCE`, or `CORE REGRESSES`. If the observed result matches none of the
predeclared conditions, reporting fails closed instead of inventing a label.
