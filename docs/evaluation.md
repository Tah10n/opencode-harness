# Evaluation

The local evaluation suite is intentionally static and deterministic. It does
not attempt to run an LLM. Instead, it performs contract/config evaluation: it
verifies that the harness contains the policy, prompt, fixture, and permission
invariants needed for OpenCode to load the intended profile.

The suite is mapped to the [Harness Control Map](harness-map.md): fast
computational sensors run locally and in CI, while installed runtime checks are
available as a separate adoption sensor.

Run all checks:

```sh
npm run verify
```

Run only the evaluation checks:

```sh
npm run eval
```

Run only the drift checks:

```sh
npm run verify:drift
```

Run installed-profile checks after copying the harness into an OpenCode
configuration:

```sh
npm run verify:runtime
```

Run the deterministic runtime parser fixtures without a local OpenCode
installation:

```sh
npm run verify:runtime:fixture
```

Validate optional live-evaluation manifests without running an agent:

```sh
npm run verify:live-eval
```

## Assurance Layers

| Layer | Command or workflow | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Static structural checks | `npm run verify:static` | Required files, config routing, frontmatter permissions, prompt invariants, docs/examples alignment. | Actual model behaviour. |
| Static contract/config evaluation | `npm run eval` | Deterministic behaviour-contract scenarios are encoded in prompts/config/docs. | That an LLM will follow them under every task. |
| Drift checks | `npm run verify:drift` | Release metadata, links, docs, and compatibility references remain coherent. | Runtime permission exposure. |
| Runtime parser fixtures | `npm run verify:runtime:fixture` | The runtime parser accepts safe debug output and rejects unsafe fixtures. | The installed profile is current. |
| Live-eval deterministic checks | `npm run verify:live-eval` | Scenario manifests are valid, fixture path-boundary checks reject repository escapes, adapter timeout/report semantics are self-tested, and hidden file staging stays runner-owned. | Actual model/tool behaviour. |
| Installed runtime permissions | `npm run verify:runtime` | Effective OpenCode profile permissions and key agents match the harness. | End-to-end task quality. |
| Optional live A/B evaluation | `npm run eval:live` | Actual model/tool behaviour on scenario corpora with hidden checks. | Deterministic proof or CI-safe assurance. |
| Inferential release review | `/harness-release-review` | Human/agent semantic coherence review across guides and sensors. | Computational proof. |

## Covered Scenarios

- Broad audits trigger recursive-context mode and require bounded `context_*`
  tools before broad reading.
- High-risk implementation requires the `global-quality-gates` skill, behavior
  contract, pre-change baseline, test obligations, plan challenge, integrated
  verification, and final completion gate.
- Review requests remain read-only and use the finding-ledger loop.
- Review commands route through the read-only `review-orchestrator` primary.
- Small local tasks prefer the single-agent loop instead of automatic
  delegation.
- Broad or parallel implementation requires the `@architect` gate and explicit
  disjoint write ownership.
- Dangerous commands remain approval-gated.
- Self-improvement is routed through `improver`, with `oc_learning_*` denied at
  the root and only available on the bounded self-improvement path.
- Project-specific knowledge belongs in project-local workflow files and
  skills, not in global memory.
- Verifier and reviewer agents stay read-only.
- Runtime and drift sensors remain wired into the template.
- Final adversarial audit is bounded and does not create endless fresh reviews.
- Specialized verification is selected by applicability, and missing tools are
  recorded as gaps rather than silent passes.
- Trace contract scenarios require a portable JSONL shape with `run_id`,
  `agent`, permission decisions, file read/write summaries, verification, and
  termination reasons.
- Budgeted termination scenarios require explicit task classes, stop
  conditions, and stable termination reasons instead of vague continuation.
- Subagent result-schema scenarios require common handoff fields, read-only
  `files_changed: []`, exact implementation changed paths, and orchestrator
  aggregation by evidence, uncertainty, termination reason, and decision
  unblocked.
- Adversarial fixture scenarios require safe static prompt-injection,
  command-injection, secret-bait, and review-only-trap fixtures that must not
  be executed.

## Behaviour contract evaluation

`scripts/evaluate-harness.mjs` treats each scenario as a behaviour contract:
the fixture is the expected harness behaviour, and the checks prove that the
current guides and sensors still encode that behaviour. These contracts are
contract/config evaluation, not a substitute for live agent evaluation.

The `trace-contract`, `budgeted-termination`, `subagent-result-schema`, and
`adversarial-fixtures` scenarios are static behavior contracts. They do not run
model calls or execute fixture content.

## Runtime Sensor

`scripts/verify-runtime.mjs` runs `opencode debug config` and
`opencode debug agent <name>` against the installed profile. Use
`HARNESS_RUNTIME_CWD` to point it at a different OpenCode configuration and
`HARNESS_RUNTIME_FIXTURE_DIR` or `--fixture-dir` to validate saved debug output
files.

The actual installed-profile runtime sensor is not part of default CI because
it depends on the host OpenCode installation and configured capability
packages. The fixture-backed parser check is deterministic, includes a negative
unsafe-permission fixture, and is included in `npm run verify`.

## Drift Sensor

`scripts/verify-drift.mjs` checks release metadata, public links, compatibility
documentation, and stale placeholder text. By default it avoids network access.
Set `HARNESS_CHECK_LINKS=1` to make it verify external links.

## Live Evaluation

`scripts/evaluate-live.mjs` validates live-evaluation scenario manifests,
self-tests fixture path confinement, adapter timeout enforcement, profile-copy
isolation, hidden file staging, and sanitized adapter reports. The deterministic
validation path is included in `npm run verify`; actual `npm run eval:live`
adapter runs are not. See [docs/live-evaluation.md](live-evaluation.md).

## Fixture

`fixtures/sample-project/` is a tiny representative project used to keep the
project-local workflow contract concrete. It is not intended to be executed as
an application.

`fixtures/adversarial/` contains static, non-executable adversarial contract
fixtures. They are safe to commit and must remain free of real secrets,
destructive commands, executable payloads, and private logs.
