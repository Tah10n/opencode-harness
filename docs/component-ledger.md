# Component ledger

This ledger assigns every major v0.3 component to one v0.4 layer. A component
is not an always-on model step unless it prevents a concrete failure mode and
has a distinct enforcement sensor.

| Component | Failure mode prevented | Mechanically enforced property and sensor | Cost | Current evidence | Disposition | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| Compact core rules | Local change misses direct contract or test | Prompt budget and core verifier require the bounded inspect/edit/verify/review loop | Low | Structural; behavioral ablation pending | core | Small default contract |
| Targeted project verification | Final mutation is not checked | Core verifier and project commands require a post-mutation relevant check | Low to medium | v0.3 verification-omission signal; component effect pending | core | Objective feedback with bounded cost |
| Independent final review | Checks miss semantic/API defects | Read-only reviewer permission contract and review ledger | Medium | Inferential; component ablation pending | deep | Useful selectively, not a small-task ritual |
| Recursive context | Hidden consumer or transitive contract is missed | Bounded read-only capability contract, limits, and fallback checks | Medium | Mixed inside v0.3 bundle; isolated evidence pending | deep | Relevant to broad tasks only |
| Scoped read-only subagents | Root context is polluted or independent searches are missed | Deep delegation limit, read-only agents, one integrator | Medium | Structural; isolated evidence pending | deep | Optional decomposition |
| Engineering Dossier | Risk and preserved behavior are underspecified | Closed dossier schemas and gate checks | High cognitive/runtime | v0.3 aggregate result inconclusive | assurance | Appropriate only for high-risk work |
| Impact graph | Transitive high-risk path is omitted | Graph schema, coverage, architecture verifier | High | Model-free contract tests | assurance | High-risk blast-radius control |
| Context receipts | Claims are not bound to observed evidence | Receipt identity, confinement, freshness, and store checks | High | Model-free contract tests | assurance | Not needed for ordinary reads |
| Context sufficiency | Mutation starts with material unknowns | Runner-owned sufficient/insufficient decision | High | Model-free state tests | assurance | Meaningful only with an assurance gate |
| Report finalization | Evidence changes after a sufficiency decision | Revision-bound report state | Medium | Model-free lifecycle tests | assurance | Runner-internal transition |
| Architect challenge | Plan ignores an architecture boundary | Role-bound challenge receipt | Medium | Inferential plus role checks | assurance | High-risk independent challenge |
| Reviewer challenge | Plan or final diff misses a counterexample | Role-bound challenge/final-review receipt | Medium | Inferential plus role checks | assurance | High-risk independent challenge |
| Mutation capabilities | Unreviewed or out-of-scope write occurs | One-shot path-bound capability and fail-closed hooks | High | Negative path and containment tests | assurance | Security boundary |
| Trusted project checks | Agent substitutes untrusted commands/evidence | Fixed executable identity, catalog binding, containment | High | Model-free and platform checks; host can be unavailable | assurance | Required where evidence authority matters |
| Reconciliation | Final diff escapes analyzed blast radius | Runner-derived changed-path reconciliation | Medium | Model-free state tests | assurance | Final high-risk scope binding |
| Attestation | Completion is claimed before evidence is complete | Fingerprint-bound terminal artifact | Medium | Model-free contract tests | assurance | Experimental completion evidence |
| Trace store | Failures cannot be replayed or analyzed | Bounded privacy-safe event schema and limits | Medium storage | Model-free tests | lab | Evaluation/debug infrastructure |
| Acceptance engine | Proxy success is confused with candidate readiness | Versioned policy, source/report binding | Medium | Model-free tests | lab | Harness evaluation, not user runtime |
| Synthetic benchmark | Components cannot be compared reproducibly | Fixture isolation, pairing, report integrity, statistics | Very high | v0.3 full run and model-free tests | lab | Research infrastructure |
| Containment helpers | Benchmark or trusted check leaves descendants | OS-specific process containment and teardown evidence | High/platform-specific | Model-free plus OS jobs | assurance/lab | Required by risky execution, absent from core |
| Controlled self-improvement | Ordinary completion mutates durable prompts | Propose/evaluate/accept guard and root denial | High maintenance | Structural checks | lab | Explicit maintenance only |
| Historical `profile-only` | v0.3 report cannot be replayed | Frozen v2 inventory and legacy readers | None at runtime | Existing artifacts | deprecated | Compatibility alias only |
| Historical `instrumented` | v0.3 report cannot be replayed | Frozen v2 inventory and legacy 17-tool plugin | None in new default | Existing artifacts | deprecated | Compatibility/replay path |

Low-level assurance state transitions remain implemented for compatibility, but
the v0.4 assurance profile exposes only the four-operation facade. The runner,
not the model, owns revisions, identity, transition selection, and terminal
evidence.
