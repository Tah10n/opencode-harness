# Evaluation

The local evaluation suite is intentionally static and deterministic. It does
not attempt to run an LLM. Instead, it verifies that the harness contains the
policy and prompt invariants needed for the agent to behave correctly when
OpenCode loads the profile.

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

## Covered Scenarios

- Broad audits trigger recursive-context mode and require bounded `context_*`
  tools before broad reading.
- Review requests remain read-only and use the finding-ledger loop.
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

## Behaviour contract evaluation

`scripts/evaluate-harness.mjs` treats each scenario as a behaviour contract:
the fixture is the expected harness behaviour, and the checks prove that the
current guides and sensors still encode that behaviour. These contracts are not
a substitute for live agent evaluation, but they catch broken or contradictory
template changes before the profile is installed.

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

## Fixture

`fixtures/sample-project/` is a tiny representative project used to keep the
project-local workflow contract concrete. It is not intended to be executed as
an application.
