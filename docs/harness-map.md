# Harness Control Map

This map keeps the harness coherent as it grows. It classifies each guide and
sensor by the terms used in the harness engineering article on martinfowler.com:
feedforward versus feedback, computational versus inferential, and the
maintainability, architecture fitness, and behaviour dimensions.

## Control Matrix

| Control | Direction | Execution type | Regulates | Lifecycle | Implementation |
| --- | --- | --- | --- | --- | --- |
| Global OpenCode rules | Feedforward | Inferential | Maintainability, architecture, behaviour | Before every task | `AGENTS.md` |
| Primary orchestrators | Feedforward | Inferential | Maintainability, architecture | Before and during implementation | `agents/orchestrator.md`, `agents/orchestrator-deep.md` |
| Context inventory gate | Feedforward | Inferential | Maintainability, behaviour | Before edits | `AGENTS.md`, `agents/orchestrator.md` |
| Safe command permissions | Feedforward | Computational | Maintainability, safety | Before command execution | `opencode.json`, agent frontmatter |
| Recursive context tools | Feedforward and feedback | Computational | Architecture, maintainability | Broad audits and large reviews | Minimal safe surface: `context_outline`, `context_files`, `context_search`, `context_read`; advanced package tools are opt-in |
| Project workflow discovery | Feedforward | Inferential | Behaviour, architecture | Before repo work | `WORKFLOW.md`, `.opencode/skills/*`, `.agents/skills/*` |
| Review ledger | Feedback | Inferential | Maintainability, behaviour | Review/fix/re-review loop | `skills/global-review-ledger/SKILL.md`, `review-diff` command |
| Verifier agent | Feedback | Computational and inferential | Maintainability, behaviour | After integration | `agents/verifier.md` |
| Static harness verifier | Feedback | Computational | Architecture fitness | Pre-commit and CI | `scripts/verify-harness.mjs` |
| Behaviour contract evaluation | Feedback | Computational | Behaviour | Pre-commit and CI | `scripts/evaluate-harness.mjs` |
| Drift verifier | Feedback | Computational | Harness health | CI and release checks | `scripts/verify-drift.mjs` |
| Runtime verifier | Feedback | Computational | Installed profile correctness | After adoption or upgrade | `scripts/verify-runtime.mjs` |
| Harness release review | Feedback | Inferential | Harness coherence | Before minor or major release | `harness-release-review`, `skills/global-harness-release-review/SKILL.md` |
| Controlled self-improvement | Feedback to feedforward | Inferential plus bounded writes | Maintainability | After verified lessons | `agents/improver.md`, `skills/global-self-improvement/SKILL.md` |

## Coverage Rules

- Every important guide should have at least one sensor that can notice when it
  stops being true.
- Every sensor should point back to the guide or contract it protects.
- Fast deterministic sensors belong in `npm run verify`.
- Runtime sensors that require installed OpenCode belong in `npm run
  verify:runtime`, not in the default CI gate.
- Expensive or semantic review belongs in release and review workflows, not on
  every local save.

## Known Gaps

- Behaviour harnessing is selective. The template can enforce review, safety,
  context, and self-improvement contracts, but each host project still needs its
  own product-level examples, tests, and workflow facts.
- Runtime verification depends on the installed OpenCode CLI and plugin surface.
  It is intentionally separate from the static repository verifier.
- Inferential checks can find contradictions and overengineering, but they
  remain probabilistic. Use them for release reviews and broad audits rather
  than as the only confidence signal.
