# Model-Neutral Host Selection

OpenCode owns model selection. Select a model with the OpenCode UI, command, or
host configuration supported by the installed version, then start the harness
normally. Primary agents use that user-selected model. Subagents inherit model
selection according to the installed OpenCode host behavior.

Do not add model IDs, provider IDs, reasoning or thinking controls, sampling
parameters, or provider-specific option blocks to core `agents/*.md`
frontmatter. Those files define roles, orchestration limits, and permissions;
they are not a second model configuration layer.

The core profile can be used with any OpenCode-supported model capable of using
the required tools and following the workflow. This is a compatibility boundary,
not a claim that every model produces equal coding quality. Provider-specific
tuning belongs to the user's OpenCode host configuration.

## Adoption example

1. Copy the portable profile without changing its core agent frontmatter.
2. Select the desired tool-capable model through OpenCode.
3. Start a primary harness agent and, when appropriate, let it delegate a
   bounded subtask.
4. Use the installed OpenCode session or agent diagnostics to observe the
   primary selection and the host's documented subagent inheritance behavior.
5. Run `npm run verify:runtime` to verify the model-neutral source profile and
   the effective permission/delegation surface.

When the profile source is outside the repository that contains the verifier,
set `HARNESS_RUNTIME_PROFILE_ROOT` to that profile root. The directory must
contain the complete `agents/` directory. The verifier rejects direct,
snake-case, and nested model/provider generation settings while allowing an
unrelated permission tool name such as `permission.model`.

The runtime probe does not prescribe a model, compare models, route requests, or
provide a fallback. Host availability and inheritance remain installed-host
observations; lack of a live OpenCode installation is reported as an external
verification gap rather than inferred success.

Prompt inventory schema v3 omits model and provider-option fields from the
quality-policy shape. It still detects raw-byte changes while gating role text,
step limits, permissions, tool/delegation surfaces, and safety sentinels. Schema
v2 remains strict historical read compatibility only.

Model identity may appear in allowlisted trace or report metadata. That metadata
is optional and observational: it never authorizes mutation, completes an
Engineering Dossier, passes a quality gate, or satisfies acceptance.
