# Evaluation

The local evaluation suite is intentionally static and deterministic. It does
not attempt to run an LLM. Instead, it verifies that the harness contains the
policy and prompt invariants needed for the agent to behave correctly when
OpenCode loads the profile.

Run all checks:

```sh
npm run verify
```

Run only the evaluation checks:

```sh
npm run eval
```

## Covered Scenarios

- Broad audits trigger recursive-context mode and require bounded `context_*`
  tools before broad reading.
- Review requests remain read-only and use the finding-ledger loop.
- Self-improvement is routed through `improver`, with `oc_learning_*` denied at
  the root and only available on the bounded self-improvement path.
- Project-specific knowledge belongs in project-local workflow files and
  skills, not in global memory.
- Verifier and reviewer agents stay read-only.

## Fixture

`fixtures/sample-project/` is a tiny representative project used to keep the
project-local workflow contract concrete. It is not intended to be executed as
an application.
