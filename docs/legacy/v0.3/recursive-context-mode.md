# Recursive Context Mode in v0.3 (Historical)

This document preserves the v0.3 instrumented behavior for replay and migration
context. It is not the active v0.4 product contract.

In v0.3 the `orchestrator` selected recursive-context mode automatically for
broad audits, production-readiness checks, repository or article study, long
logs, large diffs, and multi-module investigations. The mode was not exposed as
a separate slash command or runtime profile.

The legacy sequence coupled context decomposition to the instrumented quality
lifecycle:

1. The runner seeded a provisional Engineering Dossier, impact graph, and
   Whole-System Context Report.
2. `context_outline`, `context_files`, `context_search`, and `context_read`
   collected bounded runner-owned receipts. Instrumented context operations and
   read-only children were serialized.
3. The orchestrator refined the Dossier and linked report, finalized the report,
   and waited for runner-computed context sufficiency.
4. Architect and reviewer challenges were recorded against the current Dossier
   and report.
5. Dossier finalization and a passed mutation gate were required before edits.
6. The final diff was reconciled with the report before attestation.

The external `opencode-recursive-context` capability supplied a minimal
read-only surface (`context_outline`, `context_files`, `context_search`, and
`context_read`) plus optional advanced tools. Missing semantic tools required an
explicit bounded fallback and reduced-coverage record; they did not authorize a
weaker gate.

This design remains available only through the deprecated v0.3
`profile-only`/`instrumented` compatibility paths and historical replay. The
active v0.4 `deep` profile deliberately separates context decomposition from
the assurance lifecycle; see [`../../recursive-context-mode.md`](../../recursive-context-mode.md).
