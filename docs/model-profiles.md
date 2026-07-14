# Active GPT-5.6 Profiles And Optional Evaluation

Milestone 2 adds versioned model identities and a reproducible comparison plan.
The active harness now uses GPT-5.6 Sol for orchestration, implementation,
review, diagnosis, verification, and controlled improvement, and GPT-5.6 Terra
for exploration and research. The starting-commit GPT-5.5 profiles remain a
fingerprinted comparison baseline; A/B execution is optional and does not gate
the active configuration.

The machine-readable sources are:

- `quality/model-profiles/catalog.v1.json` — role profiles, eligibility,
  capability requirements, provenance, and fingerprints;
- `quality/model-profiles/experiment.v1.json` — the planned comparison cells,
  repetitions, variants, fixture identities, and report bindings;
- `quality/model-profiles/runtime-fixture-evidence.v1.json` — deterministic
  parser evidence only; it is not installed-runtime or behavioural proof.

## Role Matrix

| Work | Retained GPT-5.5 comparison | Active GPT-5.6 profile | Boundary |
| --- | --- | --- | --- |
| Orchestration and deep orchestration | Existing role-specific GPT-5.5 profiles | `openai/gpt-5.6-sol` | Decisions, integration, and difficult whole-system work |
| Architecture | Existing architect profile | `openai/gpt-5.6-sol` | Architecture and compatibility reasoning |
| General implementation | Existing general profile | `openai/gpt-5.6-sol` | Normal implementation; Luna is a separate evaluation-only exception |
| Review and review orchestration | Existing reviewer profiles | `openai/gpt-5.6-sol` | Correctness, regression, and final integration review |
| Diagnosis and verification | Existing diagnose/verifier profiles | `openai/gpt-5.6-sol` | Failure analysis and evidence-backed verification |
| Bounded exploration | Existing explore profile | `openai/gpt-5.6-terra` | Read-heavy, bounded discovery; not critical implementation |
| Research sidecar | Existing researcher profile | `openai/gpt-5.6-terra` | Primary-source, read-heavy research |
| Controlled improvement evaluation | Existing improver profile | `openai/gpt-5.6-sol` | Still subject to the existing guarded write boundary |
| High-volume small local control | Existing general profile | `openai/gpt-5.6-luna` | Evaluation only, `standard-lite`, low-risk, and hidden-quality gated |

Sol is active for implementation, architecture, review, diagnosis, decisions,
and integration. Terra is active for read-heavy exploration and research
sidecars. Luna is limited to evaluation-only,
high-volume `standard-lite` work; it is prohibited for critical canaries and
is not configured as a default worker.

The explicit IDs above are the reproducible identities. A generic provider
alias is not sufficient for report or decision binding.

## Reasoning And Verbosity Protocol

The active GPT-5.6 profile preserves each role's starting reasoning effort and
low text verbosity. The optional experiment compares the same effort and one
level lower.
For roles that must produce complete dossiers, plans, findings, or verification
reports, both low and medium text verbosity are compared. Two repetitions are
planned for each of the 12 quality scenarios. The checked experiment therefore
contains 96 planned comparisons: 12 scenarios, two repetitions, and four
same/lower-effort plus low/medium-verbosity variants.

The comparison keeps correctness dimensions independent: task success,
visible and hidden checks, defect escape, architecture and invariant
violations, dossier/gate completeness, affected-path coverage, test quality,
permission widening, and introduced regressions. Latency, cost, and token use
remain separate analysis dimensions and cannot compensate for a quality
regression.

GPT-5.6 profiles omit `temperature`. It must not be introduced unless the
installed runtime proves that the option is accepted and meaningful. `max`
reasoning effort, API pro mode, persisted reasoning, Programmatic Tool Calling,
and native Responses API multi-agent features are not enabled. Their OpenCode
option names and semantics are not inferred from API capability; each requires
an exact installed host surface, preserved permission and hidden-evidence
boundaries, runner attribution, and measured benefit.

## Deterministic And Installed-Runtime Checks

Validate the checked catalog, experiment, role eligibility, fingerprints, and
negative cases without a model or OpenCode installation:

```sh
npm run verify:model-profiles
npm run verify:runtime:fixture
```

Fixture evidence proves parser behavior for accepted, missing, unsupported,
ignored, alias, and conflicting values. It never proves that a real installed
runtime selected the requested model or honored its options.

After installing the profile, request evidence for one exact checked profile:

```sh
npm run verify:runtime -- --model-profile candidate-sol-general
```

For a planned A/B cell, bind the probe to the exact comparison invocation
(including its effort and verbosity override):

```sh
npm run verify:runtime -- --comparison quality-small-local-control-r1-same-low --profile-role candidate
```

The runtime verifier records the requested and effective model IDs, exact
option outcomes, runtime version, catalog fingerprint, and content
attestation. An absent, unsupported, ignored, alias, conflicting, or
unparseable required option fails or stays incomplete; it is never upgraded to
success. Run the comparison-bound probe for each distinct baseline and
candidate invocation used by the selected experiment. The immutable documents
are written under `.oc_harness/evidence/`; this directory is machine-local and
must not be committed.

Before `npm run eval:live`, set
`OPENCODE_MODEL_RUNTIME_EVIDENCE_PATH` to that evidence directory (or to one
JSON document/array). The runner selects only evidence whose model, profile,
reasoning effort, verbosity, and mode exactly match each planned comparison.
Fixture-parser evidence can exercise the pipeline but keeps the run incomplete
and cannot support acceptance.

## Active Configuration And Optional Comparison

The checked-in configuration is direct and deterministic:

1. Sol is the active profile for nine decision, implementation, review, and
   diagnostic roles;
2. Terra is the active profile for `explore` and `researcher`;
3. every active GPT-5.6 profile preserves its role's reasoning effort and low
   verbosity while omitting `temperature`;
4. Luna remains evaluation-only and is not referenced by an active agent.

The retained experiment is `planned_unexecuted`. It may be run later when a
comparative quality claim is useful, but its absence does not block activation,
deterministic verification, or release. Without installed and paired live
evidence, behavioural superiority remains unverified; that is distinct from
which explicit models the user selected. Evaluation decisions never edit the
active harness autonomously, and rejected results never mutate it.

## Prompt Pairing

Model comparisons bind a prompt-profile ID and fingerprint as well as a model
profile. `quality/prompt-inventory/baseline.v1.json` preserves bytes and lines
for all 11 agent prompts and eight skill entrypoints, plus agent model, option,
permission, task, and safety-sentinel surfaces. Skills do not synthesize agent
model or permission declarations. Declared prompt changes
must be listed in `quality/prompt-inventory/declared-changes.v1.json` and pass:

```sh
npm run verify:prompt-inventory
```

This prevents a model comparison from silently growing or changing policy text,
adding exact/normalized duplication, or losing a safety boundary. Shared policy
belongs in the global rules or focused skills;
role prompts should retain only role-specific behavior. Intentional repeated
boundaries remain explicit and fingerprinted instead of being expanded by
another duplicated instruction block.

## External Guidance

The profile protocol uses the current model and host documentation as migration
guidance, while treating installed evidence as authoritative for this harness:

- [OpenAI GPT-5.6 migration guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)
- [OpenCode agents](https://opencode.ai/docs/agents/)
- [OpenCode models](https://opencode.ai/docs/models/)
- [models.dev GPT-5.6 Sol metadata](https://models.dev/models/openai/gpt-5.6-sol/)
