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
| Quality gates | Feedforward and feedback | Inferential plus computational evidence | Behaviour, architecture, safety | Before edits through final handoff | `skills/global-quality-gates/SKILL.md`, `AGENTS.md`, orchestrators, verifier |
| Quality ledger | Feedforward and feedback | Inferential | Behaviour, compatibility, verification | High/critical task context | `skills/global-quality-gates/SKILL.md`, `agents/orchestrator.md` |
| Pre-change baseline | Feedback | Computational and inferential | Behaviour, regression control | Before high/critical edits | `skills/global-quality-gates/SKILL.md`, `agents/orchestrator.md`, `agents/verifier.md` |
| Plan-and-test-design review | Feedback | Inferential | Architecture, behaviour, test quality | Before high/critical implementation | `agents/reviewer.md`, `agents/orchestrator.md` |
| Trace contract | Feedback | Both | Maintainability, architecture, behaviour, safety | During runs, diagnosis, eval replay, and release review | `docs/trace-contract.md` |
| Budget and termination policy | Feedforward and feedback | Inferential | Maintainability, architecture, behaviour, safety | Before delegation through final handoff | `docs/budgets-and-termination.md`, `AGENTS.md`, orchestrators |
| Subagent result schema | Feedback | Inferential | Maintainability, architecture, behaviour, safety | After delegated work and before integration | `docs/subagent-result-schema.md`, `agents/*.md` |
| Adversarial fixtures | Feedback | Computational and inferential | Behaviour, safety | Static evaluation and release review | `fixtures/adversarial/`, `scripts/verify-harness.mjs`, `scripts/evaluate-harness.mjs` |
| Safe command permissions | Feedforward | Computational | Maintainability, safety | Before command execution | `opencode.json`, agent frontmatter |
| Recursive context tools | Feedforward and feedback | Computational | Architecture, maintainability | Broad audits and large reviews | Minimal safe surface: `context_outline`, `context_files`, `context_search`, `context_read`; advanced package tools are opt-in |
| Project workflow discovery | Feedforward | Inferential | Behaviour, architecture | Before repo work | `WORKFLOW.md`, `.opencode/skills/*`, `.agents/skills/*` |
| Read-only review primary | Feedforward | Computational permission boundary plus inferential aggregation | Review safety | Review commands | `agents/review-orchestrator.md`, `opencode.json` |
| Review ledger | Feedback | Inferential | Maintainability, behaviour | Review/fix/re-review loop | `skills/global-review-ledger/SKILL.md`, `review-diff` command |
| Integrated verification ladder | Feedback | Computational and inferential | Behaviour, regression control | After integration | `skills/global-quality-gates/SKILL.md`, `agents/verifier.md` |
| Final adversarial audit | Feedback | Inferential | Critical behaviour, security, data integrity | After normal review and mandatory verification | `agents/reviewer.md`, `agents/orchestrator.md` |
| Strict completion gate | Feedback | Inferential | Behaviour, safety, release confidence | Final handoff | `skills/global-quality-gates/SKILL.md`, `agents/verifier.md` |
| Verifier agent | Feedback | Computational and inferential | Maintainability, behaviour | After integration | `agents/verifier.md` |
| Static harness verifier | Feedback | Computational | Architecture fitness | Pre-commit and CI | `scripts/verify-harness.mjs` |
| Behaviour contract evaluation | Feedback | Computational | Behaviour | Pre-commit and CI | `scripts/evaluate-harness.mjs` |
| Drift verifier | Feedback | Computational | Harness health | CI and release checks | `scripts/verify-drift.mjs` |
| Runtime fixture verifier | Feedback | Computational | Runtime parser safety | Pre-commit and CI | `scripts/verify-runtime-fixtures.mjs`, `fixtures/runtime-debug/` |
| Live-eval manifest verifier | Feedback | Computational | Live-eval fixture safety | Pre-commit and CI | `scripts/evaluate-live.mjs --validate`, `scripts/evaluate-live.mjs --self-test` |
| Runtime verifier | Feedback | Computational | Installed profile correctness | After adoption or upgrade | `scripts/verify-runtime.mjs` |
| Harness release review | Feedback | Inferential | Harness coherence | Before minor or major release | `harness-release-review`, `skills/global-harness-release-review/SKILL.md` |
| Optional live A/B evaluation | Feedback | Live computational plus inferential scoring | Actual agent behaviour | Optional release or major prompt changes | `docs/live-evaluation.md`, `evals/`, `scripts/evaluate-live.mjs` |
| Controlled self-improvement | Feedback to feedforward | Inferential plus bounded writes | Maintainability | After verified lessons | `agents/improver.md`, `skills/global-self-improvement/SKILL.md` |

## Coverage Rules

- Every important guide should have at least one sensor that can notice when it
  stops being true.
- Every sensor should point back to the guide or contract it protects.
- Fast deterministic sensors belong in `npm run verify`.
- Runtime sensors that require installed OpenCode belong in `npm run
  verify:runtime`, not in the default CI gate.
- Optional live A/B evaluation belongs outside `npm run verify` because it
  depends on model access, installed profiles, isolated repos, and hidden test
  execution.
- Deterministic live-eval manifest validation and runner self-tests belong in
  `npm run verify` because they are fast and do not run a model.
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
- Static structural checks and contract/config evaluation do not prove actual
  LLM behaviour. Use optional live A/B evaluation when prompt, orchestration,
  delegation, or review-loop changes need behavioural evidence.
