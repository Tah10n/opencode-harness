# Compatibility

## Development And Tagged Release Set

| Component | Repository | Version | Status | Role |
| --- | --- | --- | --- | --- |
| `opencode-harness` | <https://github.com/Tah10n/opencode-harness> | `0.3.0` | Unreleased target | Development orchestration profile with feedback APIs, live evaluation, candidate assessment, docs, and verifiers. |
| `opencode-harness` | <https://github.com/Tah10n/opencode-harness/tree/v0.2.0> | `v0.2.0` | Latest tagged release | Tagged orchestration profile, rules, docs, and verifier; its package has no package exports and does not expose feedback API subpaths. |
| `opencode-recursive-context` | <https://github.com/Tah10n/opencode-recursive-context> | `0.1.x` | Compatible capability | Safe read-only `context_*` tools. |
| `opencode-learning-guard` | <https://github.com/Tah10n/opencode-learning-guard> | `0.1.x` | Compatible capability | Bounded `oc_learning_*` memory and managed-skill write tools. |

Do not read development-checkout documentation as a claim about `v0.2.0`.
The public `opencode-harness/feedback` and `opencode-harness/trace-store`
subpaths belong to the unreleased `0.3.0` target until that version is tagged.

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
- Node.js 24 or newer is required by package metadata and used by CI.
- The feedback plane is Node ESM. Public imports are
  `opencode-harness/feedback` and the compatibility alias
  `opencode-harness/trace-store`; private `lib/feedback/*` paths are not a
  compatibility contract.
- Trace writers emit schema version 2. Readers accept the exact documented
  schema-v1 event shape when safe, but do not reinterpret malformed legacy
  artifacts or append v2 events to a v1 stream.
- `opencode-recursive-context` defines its own Node.js support policy.
- `opencode-learning-guard` defines its own Node.js support policy.

## Compatibility Checks

For this repository:

```sh
npm run verify
```

For an installed OpenCode profile:

```sh
opencode agent list
opencode debug config
opencode debug agent orchestrator
opencode debug agent review-orchestrator
opencode debug agent reviewer
opencode debug agent improver
```

Treat a missing `context_*` tool, unexpected `oc_learning_*` exposure, or
missing command template as a compatibility failure. Required harness agents
must also retain their declared `primary`/`subagent` modes; the normalized
inventory is part of runtime evidence.

The default repository verifier checks static template structure. The runtime
verifier first obtains the authoritative installed-agent inventory, then checks
the effective config and every discovered agent profile:

```sh
npm run verify:runtime
```

Optional general live regression evaluation is compatibility-adjacent
behavioural evidence for
prompt, orchestration, delegation, and review-loop changes. It does not replace
static or runtime permission checks.

The live runner requires an explicit host adapter module, baseline/candidate
profiles, and content-bound installed permission evidence for both. A missing
adapter/profile/evidence input fails honestly; arbitrary OpenCode sessions are
not automatically traced without a host runtime hook. Suite labels,
held-out/canary metadata, hidden checks/assertions, and acceptance thresholds
remain runner-only. `expected_contracts` and `forbidden_regressions` are also
runner-only and never enter adapter context.

Candidate acceptance requires trusted first-party evidence producers. Static
evidence comes from `npm run evidence:static`; permission evidence comes from
`npm run verify:runtime -- --evidence-profile <id> --subject-evidence
<static.json>` against an installed profile. Runtime fixture snapshots remain
compatible parser tests but are not trusted acceptance inputs. Missing or
malformed agent inventory fails closed; unsupported permission output is
incomplete rather than default-deny. Acceptance trusts only intact report
history generations and derives the required pair universe from the canonical
validated workspace corpus.

## Engineering quality compatibility

The deterministic repository gate targets Node.js 24 and has no installed
OpenCode dependency. A July 2026 installed-runtime probe observed OpenCode
`1.17.20`; the probe resolves the project-local `@opencode-ai/plugin` copy
before older global copies. Runtime observations are evidence, not package pins.

The bridge uses documented plugin surfaces present in that API: custom `tool`
definitions, `tool.execute.before`, `tool.execute.after`, and `event`.
`permission.ask` is exposed only as compatibility defense; OpenCode 1.17.20's
permission service does not invoke it, so enforcement does not depend on it.
If a host omits or cannot parse a required pre-tool surface, runtime verification
returns `incomplete`. If a constructed pre-tool callback fails to deny the
native edit or writable-delegation probes, it returns `failed`.

Quality attestation schema v2 is intentionally model-neutral. Model-bound v1
attestations are not accepted as v2 completion evidence. Prompt inventory
schema v2 keeps model and provider settings as informational metadata while
permission, prompt, tool, and sentinel drift remain gated.

Active model IDs are read only from `agents/*.md` frontmatter. Availability
of a configured model is an installed-host concern and never a requirement for
`npm run verify`.

The committed-whitespace verifier invokes Git with argv arrays and supports
Windows and POSIX. GitHub pull-request and push runs require a full checkout and
the explicit base or before SHA supplied by the workflow. Missing objects are
incomplete rather than successful.
