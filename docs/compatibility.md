# Compatibility

## Development And Tagged Release Set

| Component | Repository | Version | Status | Role |
| --- | --- | --- | --- | --- |
| `opencode-harness` | <https://github.com/Tah10n/opencode-harness> | `0.3.0` | Unreleased target | Development orchestration profile with feedback APIs, live evaluation, candidate assessment, docs, and verifiers. |
| `opencode-harness` | <https://github.com/Tah10n/opencode-harness/tree/v0.2.0> | `v0.2.0` | Latest tagged release | Tagged orchestration profile, rules, docs, and verifier; its package has no package exports and does not expose feedback API subpaths. |
| `opencode-recursive-context` | <https://github.com/Tah10n/opencode-recursive-context> | `0.1.x` | Compatible capability | Safe read-only `context_*` tools. |
| `opencode-learning-guard` | <https://github.com/Tah10n/opencode-learning-guard> | `0.1.x` | Compatible capability | Bounded `oc_learning_*` memory and managed-skill write tools. |

Do not read development-checkout documentation as a claim about `v0.2.0`.
The public `opencode-harness/feedback`, `opencode-harness/quality`, and
`opencode-harness/trace-store` subpaths belong to the unreleased `0.3.0` target
until that version is tagged.

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
- The Milestone 2 quality plane is Node ESM at `opencode-harness/quality`.
  Checked schemas and manifests under `quality/` define persisted artifact
  compatibility; private `lib/quality/*` paths are not consumer entry points.
- Trace writers emit schema version 2. Readers accept the exact documented
  schema-v1 event shape when safe, but do not reinterpret malformed legacy
  artifacts or append v2 events to a v1 stream.
- `opencode-recursive-context` defines its own Node.js support policy.
- `opencode-learning-guard` defines its own Node.js support policy.

Engineering Dossier, preimplementation-evidence, gate, impact-graph,
architecture-evaluation, and quality-attestation artifacts are strictly
versioned and fingerprinted. Unknown keys,
unsupported versions, dangling references, and post-finalization mutation fail
closed. Project architecture policy is optional: a missing policy is
`not_configured`, while a configured policy must validate exactly and bind a
trusted post-implementation candidate-graph evaluation to the dossier baseline.
Missing post-edit graph evidence is incomplete, not a pass. Adopters must not
synthesize dependency rules from repository layout or let an adapter attest
its own graph and call that compatible.

GPT-5.6 compatibility is per explicit model ID and effective option surface,
not per generic family alias. The active profiles are
`openai/gpt-5.6-sol` and `openai/gpt-5.6-terra`;
`openai/gpt-5.6-luna` remains evaluation-only, and GPT-5.5 is retained only as
an optional comparison baseline. GPT-5.6 profiles omit `temperature`, and
`max`, API pro mode, and persisted reasoning are not enabled without
installed-runtime proof of the exact OpenCode option keys and semantics.

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

For an exact checked model role, capture installed-runtime model evidence:

```sh
npm run verify:runtime -- --model-profile candidate-sol-general
```

The probe must resolve the requested model and required options exactly.
Missing, unsupported, ignored, alias-only, conflicting, or unparseable values
are failures or incomplete evidence. `npm run verify:runtime:fixture` covers
the parser matrix but is never proof of installed compatibility.

Optional live A/B evaluation is compatibility-adjacent behavioural evidence for
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
`npm run verify:runtime -- --evidence-profile <runtime-profile-id> --subject-id
<static-candidate-id> --subject-evidence <static.json>` against an installed
profile. Omitting `--subject-id` preserves the legacy same-ID behavior. Runtime fixture snapshots remain
compatible parser tests but are not trusted acceptance inputs. Missing or
malformed agent inventory fails closed; unsupported permission output is
incomplete rather than default-deny. Acceptance trusts only intact report
history generations and derives the required pair universe from the canonical
validated workspace corpus.

Schema-v2 quality acceptance also requires per-result model, prompt, runtime,
permission snapshot/profile, dossier, gate, and attestation identities
prescribed by the checked experiment. Legacy v1 reports remain readable
compatibility evidence but cannot satisfy those v2 quality requirements. Even
an `accepted` decision does not
apply a configuration change; rejected candidates never mutate the active
harness.
