# Recursive Context in v0.4 `deep`

## Product boundary

Recursive context is retained as an unpromoted development candidate of the
explicit `deep` profile. It is not a product recommendation without separate
positive medium-task evidence.

`core` never switches to or recommends `deep`. Research evaluation requires one
of these explicit inputs:

- choose the `deep` profile/configuration;
- invoke `/deep`;
- apply a project-local `WORKFLOW.md` rule that explicitly selects `deep` for a
  declared task class.

The retained runtime profile still exposes its historical bounded read-only
operations for compatibility. The candidate mechanism under evaluation is
instead host-owned: mapping runs before the model on every eligible medium task.

## Minimal capability

The minimal safe harness surface of the coordinated
`opencode-recursive-context` capability exposes four default read-only tools:

- `context_outline` — compact workspace and guidance outline;
- `context_files` — scoped, paginated file inventory;
- `context_search` — bounded literal search excerpts;
- `context_read` — bounded text ranges.

The v0.4 configs deny `context_*` by default. Only these four exact IDs are
allowed on the agents that need them. A newly installed tool such as
`context_write` or `context_exec` therefore remains denied. Advanced read-only
tools (`context_map`, `context_batch_read`, `context_symbols`, or
`context_related`) require a separate explicit host policy and are not part of
the default `deep` surface: advanced tools are opt-in.

The coordinated compatibility target is `opencode-recursive-context` 0.2.0,
output schema v2, contract 2.0, and policy 1. The tools remain path-confined,
skip generated/high-noise directories and `.oc_harness`, and refuse secret-like
paths and credential files.

Path filtering and permission rules reduce accidental exposure, but they are
not an absolute security boundary against a malicious local process that
already has the user's filesystem authority. Keep secrets outside the selected
workspace and review any host-side capability expansion.

## Deep workflow

1. Build a compact workspace map.
2. Locate project guidance, entry points, consumers, tests, and public
   contracts.
3. Delegate only independent read-only questions, with at most three active
   read-only children.
4. Aggregate compact path/line evidence and distinguish observations,
   inference, uncertainty, and reasoned exclusions.
5. Implement through one integrator; do not delegate overlapping writes.
6. Run integration verification and one independent final review for a
   nontrivial change.

Profile-only mode may parallelize independent read-only work within the bound
above. Instrumented compatibility mode serializes context operations and
read-only child tasks one at a time whenever runner-owned receipts are
enforced; it does not claim a parallel computational receipt chain.

Avoid duplicate broad symbol scans. If a targeted `context_symbols` query is
planned under an opt-in host policy, use `context_map` with
`includeSymbols: false`. Repeat a broad symbol query only for a new boundary:
new query, kind, or narrower scope.

Do not create computational receipts merely to demonstrate protocol
compliance. Structured evidence exists to support the engineering decision.

## Fallback

If the optional capability is absent, use bounded ordinary file discovery,
search, and line-range reads. Report the reduced semantic coverage and any
unresolved path. Missing recursive-context tools do not block ordinary core or
deep work and do not justify an unsupported completeness claim.

## Separation from assurance

`deep` does not include an Engineering Dossier, context-receipt chain,
runner-computed context-sufficiency gate, mutation authorization, trusted-check
lifecycle, reconciliation, or attestation. Those controls remain only in the
deprecated research-only `assurance` compatibility profile.

A deep investigation must not recommend legacy assurance for product work. If
it finds security, authorization, migration, durable persistence, shared-state
concurrency, destructive-data, or critical-public-contract risk, it follows
project-owned controls or reports that no promoted harness mode covers the risk.

The former v0.3 automatic orchestrator/instrumented workflow is preserved for
historical replay in
[`legacy/v0.3/recursive-context-mode.md`](legacy/v0.3/recursive-context-mode.md).

## Verification

Verify the active contract with:

- `npm run verify:deep`
- `npm run eval`
- `npm run probe:runtime:v0.4`

The installed-runtime probe is optional live validation. The deterministic
checks remain the portable release baseline; a missing host capability must be
reported as unverified rather than converted into a passing runtime claim.

The required runtime result is that `deep` and its read-only explorer allow only
the four minimal context tools, unknown prefixed tools remain denied, `core`
exposes none of them, and profile selection remains explicit.
