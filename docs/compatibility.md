# Compatibility

## Current Release Set

| Component | Repository | Compatible version | Role |
| --- | --- | --- | --- |
| `opencode-harness` | <https://github.com/Tah10n/opencode-harness> | `v0.2.0` | Agent orchestration profile, rules, docs, and verifier. |
| `opencode-recursive-context` | <https://github.com/Tah10n/opencode-recursive-context> | `0.1.x` | Safe read-only `context_*` tools. |
| `opencode-learning` | <https://github.com/Tah10n/opencode-learning> | `0.1.x` | Bounded `oc_learning_*` memory and managed-skill write tools. |

Note: the `opencode-learning` repository currently exposes the plugin package
under the package name `opencode-learning-guard`.

## Runtime Expectations

- OpenCode must support the configured agent, command, skill, and plugin
  surfaces used by this profile.
- Node.js 24 is used by CI for the template verifier.
- `opencode-recursive-context` defines its own Node.js support policy.
- `opencode-learning` defines its own Node.js support policy.

## Compatibility Checks

For this repository:

```sh
npm run verify
```

For an installed OpenCode profile:

```sh
opencode debug config
opencode debug agent orchestrator
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
