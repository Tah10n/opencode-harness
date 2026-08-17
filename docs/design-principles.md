# Design principles

| Source or idea | Preserved principle | Where implemented | Where it does not apply | How verified |
| --- | --- | --- | --- | --- |
| Guides and sensors | Important guidance should have objective feedback | Core rules, project checks, v0.4 verifiers | Prose-only preferences that cannot be measured | Guide/sensor drift checks |
| Project-specific computational feedback | Repository tests and workflow facts outrank universal prompt rules | `core` and every heavier layer | Model-quality claims without model-backed evidence | `verify:core`, project checks |
| Context decomposition | Select and decompose context instead of dumping the repository | Optional `deep` workflow | Small local tasks | Deep permission and delegation-limit checks |
| Scoped subagents | Delegate independent questions with one integrator | `deep`, up to three read-only children | Default small-task loop | `verify:deep` |
| Progressive disclosure | Load detailed rules only when the task needs them | Compact `AGENTS.md`, profile agents, skills | Always-on documentation | Prompt-budget verifier |
| Durable state for long tasks | Persist only bounded state that supports long/risky work | Assurance session state and lab traces | Core and deep | Bundle boundary and permission checks |
| Propose/evaluate/accept learning | Repeated verified failures may become sensors or guides only after review | Explicit `/learn` and improver workflow | Automatic task completion | Root/profile denial and learning guard checks |
| Complexity after evidence | A component enters the default only on its declared target metric | vNext policy and component ledger | Attractive ideas or article mentions alone | Exact ablation and policy-fingerprint checks |
| Model neutrality | The host owns model/provider/variant choice | Benchmark bindings and runtime config | Repository-selected model routing | Profile and report binding checks |
| Honest evidence classes | Structural, synthetic, and model-backed evidence stay distinct | vNext reports and promotion policy | Unsupported quality claims | Report schema and blocked-state self-tests |

No article or general engineering principle is treated as proof that a specific
Engineering Dossier lifecycle improves coding-agent correctness. That question
remains experimental and is evaluated component by component.
