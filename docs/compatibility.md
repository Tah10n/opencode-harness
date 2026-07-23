# Compatibility

## Development And Tagged Release Set

| Component | Repository | Version | Status | Role |
| --- | --- | --- | --- | --- |
| `opencode-harness` | <https://github.com/Tah10n/opencode-harness> | `0.3.0` | Unreleased target | Development orchestration profile with feedback APIs, live evaluation, candidate assessment, docs, and verifiers. |
| `opencode-harness` | <https://github.com/Tah10n/opencode-harness/tree/v0.2.0> | `v0.2.0` | Latest tagged release | Tagged orchestration profile, rules, docs, and verifier; its package has no package exports and does not expose feedback API subpaths. |
| `opencode-recursive-context` | <https://github.com/Tah10n/opencode-recursive-context> | `0.2.0` | Coordinated release target | Safe read-only `context_*` tools; output schema v2, contract 2.0, policy 1. |
| `opencode-learning-guard` | <https://github.com/Tah10n/opencode-learning-guard> | `0.2.0` | Compatible capability | Bounded `oc_learning_*` memory and managed-skill write tools. |

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

| Harness target | Capability target | Output schema | Contract | Policy | Minimal surface | Advanced opt-in surface |
| --- | --- | --- | --- | --- | --- | --- |
| `opencode-harness` `0.3.0` | `opencode-recursive-context` `0.2.0` | v2 | 2.0 | 1 | `context_outline`, `context_files`, `context_search`, `context_read` | `context_map`, `context_batch_read`, `context_symbols`, `context_related` |

Harness adapters also accept legacy schema-v2 capability envelopes without
the additive producer metadata. When metadata is present, an unknown producer
or unsupported contract fails closed. The harness has no production runtime
dependency on the capability package; the contract export is consumed only by
tests, tooling, and the explicit cross-repository verifier.

Capability output schema v2 is distinct from the harness evidence formats.
New runner-owned context receipts use schema v3 and new receipt-evidence indexes
use schema v4. Strict index v3 remains readable as historical evidence but
cannot authorize aggregate file coverage. New preimplementation evidence uses
schema v2; legacy quality bundle v2 dispatches strictly to evidence schema v1
and forbids context artifacts. A passed high/critical bundle v3 requires current
evidence v2 together with its bound report, sufficiency decision, and task-profile
evidence; a resealed bundle cannot omit that preimplementation chain.

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

For the real capability/consumer boundary with both checkouts present:

```sh
npm run verify:recursive-context-contract -- --capability-root ../opencode-recursive-context
```

This explicit verifier is intentionally outside the default `npm run verify`,
so an absent sibling checkout cannot make the deterministic harness suite
environment-dependent. The dedicated `Recursive context contract` workflow
requires a full 40-character capability commit SHA, checks out exactly that
commit, confirms `HEAD`, and runs the matrix on Linux and Windows. A branch,
tag, or implicit default-branch checkout is not accepted. Invoke that workflow
only after the coordinated capability commit is reachable on GitHub.

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

The public quality-attestation reader accepts strict schema v2 and v3
documents; new attestations are emitted only as context-aware v3. Model-bound
v1 attestations are not accepted as completion evidence. Prompt inventory
schema v2 remains strict historical read compatibility. New inventories use
schema v3, which omits model/provider configuration from the policy shape while
retaining raw-byte observability and gating role content, step limits,
permissions, tools, delegation, and sentinels. Mixed v2/v3 inventory comparison
fails closed.

The post-edit architecture reader preserves strict evidence v1 and graph
evidence v2 as historical input. New authoritative reconciliation evidence is
written only as evidence v3 with graph-delta v2; historical forms cannot
authorize a fresh extractor-grounded reconciliation.

The user-selected OpenCode model is authoritative. Core `agents/*.md`
frontmatter contains no model/provider generation settings; primary agents use
the host selection and subagents inherit according to installed-host behavior.
Model availability and inheritance are host observations and never requirements
for deterministic `npm run verify` acceptance.

The committed-whitespace verifier invokes Git with argv arrays and supports
Windows and POSIX. GitHub pull-request and push runs require a full checkout and
the explicit base or before SHA supplied by the workflow. Missing objects are
incomplete rather than successful.
