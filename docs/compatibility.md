# Compatibility

## Current Release Set

| Component | Repository | Compatible version | Role |
| --- | --- | --- | --- |
| `opencode-harness` | <https://github.com/Tah10n/opencode-harness> | `v0.2.0` | Agent orchestration profile, rules, docs, and verifier. |
| `opencode-recursive-context` | <https://github.com/Tah10n/opencode-recursive-context> | `0.1.x` | Safe read-only `context_*` tools. |
| `opencode-learning-guard` | <https://github.com/Tah10n/opencode-learning-guard> | `0.1.x` | Bounded `oc_learning_*` memory and managed-skill write tools. |

Note: `oc_learning_*` remains the stable OpenCode tool prefix even though the
repository and package are named `opencode-learning-guard`.

`opencode-recursive-context` may expose more read-only tools than this harness
grants. The default harness contract is the minimal safe surface:
`context_outline`, `context_files`, `context_search`, and `context_read`.
Advanced tools such as `context_map`, `context_batch_read`, `context_symbols`,
and `context_related` are host opt-ins.

## Runtime Expectations

- OpenCode must support the configured agent, command, skill, and plugin
  surfaces used by this profile.
- Compatibility has two layers: supported package/OpenCode configuration
  surfaces and actual installed permission exposure. Static files can be
  compatible while a copied live profile is not.
- Node.js 24 is used by CI for the template verifier.
- `opencode-recursive-context` defines its own Node.js support policy.
- `opencode-learning-guard` defines its own Node.js support policy.

## Compatibility Checks

For this repository:

```sh
npm run verify
```

For an installed OpenCode profile:

```sh
opencode debug config
opencode debug agent orchestrator
opencode debug agent review-orchestrator
opencode debug agent reviewer
opencode debug agent improver
```

Treat a missing `context_*` tool, unexpected `oc_learning_*` exposure, or
missing command template as a compatibility failure.

The default repository verifier checks static template structure. The runtime
verifier checks the effective installed profile:

```sh
npm run verify:runtime
```

Optional live A/B evaluation is compatibility-adjacent behavioural evidence for
prompt, orchestration, delegation, and review-loop changes. It does not replace
static or runtime permission checks.
