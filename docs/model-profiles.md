# Model Configuration

Model selection is a user-configurable host preference. The active
`model:` field in each `agents/*.md` frontmatter block is the only
configuration authority; quality logic does not consult a second model catalog.

| Roles | Current model | Agent files |
| --- | --- | --- |
| Orchestration, architecture, implementation, review, verification, diagnosis, and improvement | `openai/gpt-5.6-sol` | `orchestrator.md`, `orchestrator-deep.md`, `review-orchestrator.md`, `architect.md`, `general.md`, `reviewer.md`, `verifier.md`, `diagnose.md`, `improver.md` |
| Bounded exploration and research | `openai/gpt-5.6-terra` | `explore.md`, `researcher.md` |

All paths above are under `agents/`.

To change a model, edit the `model:` field in the YAML frontmatter of the
relevant `agents/<name>.md` file.

Example:

```yaml
model: openai/your-model-id
```

Preserve the role prompt and permissions when changing only the model.
`reasoningEffort` and `textVerbosity` are separate optional frontmatter
settings. A replacement provider or model may support different values or may
not support those options at all, so verify them against the installed host.

The prompt inventory records model and provider-option values as informational
metadata, but model-only changes do not fail the quality gate and do not require
updating a fingerprinted catalog. Permission, tool-surface, safety-sentinel, and
quality-relevant prompt changes remain reviewable drift.

Installed-runtime checks may warn that a configured model is unavailable.
`npm run verify` stays model-free, credential-free, network-free, and
independent of any installed OpenCode runtime. Host-supplied model identity may
appear as optional trace or report metadata; it never authorizes an edit,
completes an Engineering Dossier, or passes quality acceptance.
