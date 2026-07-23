# Whole-System Context

Milestone 3 adds a computational context-sufficiency step before the existing
Engineering Dossier gate. It helps the agent answer two different questions:

1. What parts of the system can this change affect?
2. What can go wrong on each critical affected path?

The user continues to ask for a change normally. The runner selects the minimum
strategy, records evidence, and reports a concise blocked-or-ready result.

## Sequence and authority

For high and critical work, the order is fixed:

1. `chat.message` registers the session.
2. `quality_session_start` classifies risk and selects the minimum context
   strategy.
3. `quality_dossier_create` creates a provisional Engineering Dossier draft and
   provisional impact graph.
4. Bounded context operations produce runner-owned context receipts, and
   serialized read-only child tasks settle, bind, and incorporate one at a time.
5. `quality_dossier_update` refines the Dossier and impact graph from evidence.
6. `quality_context_report_update` refines the linked Whole-System Context Report.
7. `quality_context_report_finalize` finalizes the Whole-System Context Report.
8. Wait for the current runner-owned sufficient context decision; an insufficient
   decision leaves the Dossier unready.
9. Architect and reviewer challenge the canonical current challenge subject:
   current Dossier analysis, selected strategy, finalized report analysis, exact
   sufficiency decision, and task-profile evidence. Any change to one of those
   inputs invalidates both contributions.
10. `quality_dossier_finalize` finalizes the current Dossier and evaluates the
   existing quality gate.
11. Only a runner-owned passed gate authorizes a bounded mutation.

The report does not authorize writes. Context sufficiency and Dossier
finalization also do not authorize writes. The agent cannot choose a weaker
strategy, invent receipt IDs, set the sufficiency result, or substitute prose
for runner evidence.

## Strategy classes

- `standard-lite-local-v1` keeps a confirmed one-file or tightly local task
  small. It needs bounded local evidence but no full context report or broad
  delegation.
- `high-wide-deep-v1` requires wide affected-system coverage plus one deep
  analysis for every critical impact path.
- `critical-wide-deep-v1` preserves the high strategy and adds the applicable
  recovery, integrity, authorization, privacy, or concurrency obligations.

Budgets limit uncontrolled discovery. Reaching a call count is never proof of
understanding. A new public, transitive, persistent, concurrent, security, or
migration boundary causes escalation.

## Evidence receipts

Successful, failed, unavailable, empty, and truncated context operations are
different states. The runner records bounded metadata such as tool identity,
scope paths, relation categories, line ranges, snapshot identity, result
fingerprint, causal sequence, and truncation state.

Receipts do not contain raw source, search output, prompts, completions, private
reasoning, raw subagent transcripts, secrets, or absolute private paths. A
report may reference only current receipts from its own session and workspace.
Post-mutation or stale receipts cannot prove pre-mutation analysis.

Context receipts use schema v3. Direct `context_read` and `context_batch_read`
results persist only bounded ranges plus a runner-salted exact file-version
fingerprint and total-line count. Adjacent or overlapping ranges may prove one
complete file only when their union covers `1..totalLines` for one stable,
pre-mutation session/workspace/strategy binding. Gaps, mixed identities or line
counts, hash mismatches, partial batch failures, non-range truncation, drift,
cross-session evidence, and post-mutation reads fail closed. Search, inventory,
and symbol hits never substitute for content coverage, and the per-call maximum
remains 500 lines.

Authorizing v3 requests additionally retain only safe bindings: a salted
expected content-version fingerprint per requested range, the expected
snapshot fingerprint, canonical pagination cursor, and stable-snapshot
requirement when supplied. Early v3 receipts without these additive fields
remain readable, but new output is accepted only when its successful reads,
batch cardinality, pagination, failures, and verified snapshots match the exact
request. A claimed successful read with `stableDuringRead: false` is rejected
before it can become content-backed evidence.

A single `context_files` pagination page is transport evidence, not proof of a
complete repository inventory. Paginated pages remain partial and cannot support
an authorizing exclusion until a future receipt contract can represent and
validate the complete terminal continuation chain on one snapshot.

The derived receipt-evidence index uses schema v4 and stores canonical per-file
coverage diagnostics. Strict schema-v3 indexes remain readable as legacy evidence
but cannot authorize aggregate full-file coverage because they lack salted file
identity and total-line metadata. Each relationship record
preserves the requested target path, related path, relationship kind, and
confidence; the legacy `relationship_paths` list is only a derived summary and
never authorizes a semantic decision. `direct-import` is normalized as target
to related path, while `imported-by` is normalized as related path to target.
Only a correctly directed high-confidence import may positively support a
semantic graph edge. An import candidate at any confidence fails closed when it
contradicts a claimed absence of transitive consumers. Heuristic
`likely-test`, `same-basename`, and `sibling` relations require classification
and direct inspection but do not by themselves prove a consumer. Evidence-index
v2 is rejected by authorizing paths because it irreversibly discarded the
relationship kind, direction, and confidence.

Preimplementation evidence uses schema v2. High/critical architect and reviewer
receipts bind the same canonical subject fingerprint, including the current
Dossier analysis, strategy, finalized report analysis, runner-owned sufficient
decision, and task-profile evidence. A one-sided, replayed, or stale contribution
cannot pass the gate.

In the live quality path, only the runner's context observer may turn a context
operation into one of these receipts. Adapter output is untrusted task output;
there is no adapter callback that can mint a trusted receipt. The installed
normal-session bridge applies the same rule at its host-hook boundary.

Instrumented quality mode serializes context operations and read-only child
tasks because a second pending operation or active child is rejected. Each
result is settled, bound, and incorporated before the next launch. Profile-only
mode may optionally parallelize independent read-only work, but it provides no
computational receipt-chain guarantee.

## Wide and deep analysis

The wide section covers relevant instructions, modules, entry points, direct
and transitive relations, public contracts, data/config shapes, stateful and
external boundaries, ownership, tests, siblings, exclusions, unknowns, tool
availability, and truncation.

The deep section links to existing critical impact-graph paths rather than
building a second graph. It classifies applicable control flow, data flow,
state, side effects, errors, retry/idempotency, cancellation/concurrency,
transactions/rollback, cleanup, cache state, compatibility, security, and
verification obligations.

Observed facts, inferred relations, hypotheses, and reasoned exclusions remain
separate. Material hypotheses receive a falsification attempt. A refutation or
blocking uncertainty changes the plan or keeps the gate blocked.

## Tool profiles

The portable default remains:

- `context_outline`
- `context_files`
- `context_search`
- `context_read`

`quality/context-tool-overlays/advanced-readonly.v1.json` documents an optional
host overlay for `context_map`, `context_batch_read`, `context_symbols`, and
`context_related`. The overlay grants no shell, network, write, or persistence
authority. High and critical work may use an honest bounded fallback when the
advanced surface is unavailable. The report must set `fallback_used` and
`reduced_semantic_coverage`, must not claim semantic completeness, and must bind
complete literal content evidence to every planned graph subject. Any material
unknown, unresolved exclusion, truncation, missing falsification, or missing
verification mapping still blocks sufficiency. Literal search never becomes a
claim of a complete semantic call graph; optional advanced relation evidence is
stronger evidence, not a portable-operation prerequisite.

## Evaluation and reconciliation

`quality/context-live-scenarios.v1.json` binds context verifier codes to at
least twelve existing live scenarios and five mechanism-specific additions.
Runner-owned hidden assertions check ordering, receipts, wide/deep coverage,
unknown resolution, verification mapping, bounded discovery, ownership, and
final reconciliation. Standard-lite separately checks that the process stayed
small.

Before final attestation, post-architecture evidence v3 binds both the planned
and final graph fingerprints and stores a bounded machine-derived graph-delta
v2. Legacy evidence v1 and graph evidence v2 remain strictly readable as
history, but only v3 can authorize new extractor-grounded reconciliation.
The runner treats reduced coverage or confidence, count-aware new unknowns or
exclusions, lost evaluator or semantic-tool availability, lost boundaries, and
critical-path downgrades as trust regressions. Any such regression invalidates
the earlier sufficiency decision and requires report revision and gate
re-evaluation. Caller-provided unexpected-path arrays remain non-authoritative;
any mismatch with the runner delta blocks reconciliation.
Changed source, schema, and config paths all require applicable verification
mapping, and that mapping is satisfied only by required slice or integration
obligations with passed post-mutation check receipts.

The final changed-path set is runner-observed, and reviewer reconciliation is
resolved from an immutable traced reviewer result bound to that diff. An
adapter's proposed changed paths or reviewer checks cannot satisfy this gate.

Metrics remain separate: category coverage, deep-path coverage, unknowns,
transitive paths, exclusions, tool calls, duplicate reads, truncation,
semantic-tool state, verification mapping, hidden escape, architecture drift,
unrelated writes, and standard-lite over-analysis are not collapsed into one
score.

## Computational checks and reasoning boundary

The runner can prove artifact order, session/workspace binding, receipt
existence and timing, required-category representation, impact-path linkage,
dimension classification, blocking-unknown state, truncation state, test
mapping, ownership, final changed paths, and the exact deterministic reason
codes derived from those records. It can also prove that raw context output was
not placed in the persisted receipt shape.

The model still performs the semantic work: choosing useful questions,
interpreting source and relationships, deciding which inferred paths are
plausible, constructing meaningful counterexamples, and explaining why an
exclusion is relevant. Receipts prove that bounded operations happened; they do
not prove complete semantic understanding. Minimal-tool fallback therefore
records reduced semantic coverage, and unresolved material uncertainty keeps
the gate blocked.
