import fs from "node:fs";
import path from "node:path";

import {
  NORMAL_SESSION_QUALITY_TOOL_IDS,
  createNormalSessionQualityBridge,
  executeNormalSessionQualityTool,
  handleNormalSessionChatMessage,
  handleNormalSessionEvent,
  handleNormalSessionPermission,
  handleNormalSessionToolAfter,
  handleNormalSessionToolBefore,
} from "./normal-session-bridge.mjs";
import { ContractError } from "./validation.mjs";
import { QUALITY_SESSION_SCOPE_FACT_KEYS } from "./constants.mjs";

const TASK_QUALITY_CONTINUATION_MARKER = "[runner quality continuation]";

export function legacyQualityPluginEnabled(workspaceRoot) {
  const configPath = path.join(workspaceRoot, "opencode.json");
  try {
    const stat = fs.lstatSync(configPath);
    if (stat.isSymbolicLink() || !stat.isFile()) return true;
    const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/u, ""));
    return config.default_agent !== "core";
  } catch {
    return true;
  }
}

function validSessionId(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 1_000
    && !/[\r\n\0]/u.test(value);
}

export function createOpenCodeSessionInfoResolver(client, { directory = undefined } = {}) {
  if (typeof client?.session?.get !== "function") {
    throw new ContractError("QUALITY_PLUGIN_API", "OpenCode session.get is required for authoritative child binding");
  }
  if (directory !== undefined && (typeof directory !== "string" || directory.length === 0 || directory.includes("\0"))) {
    throw new ContractError("QUALITY_PLUGIN_API", "OpenCode session lookup directory is invalid");
  }
  return async (sessionID) => {
    if (!validSessionId(sessionID)) {
      throw new ContractError("QUALITY_SESSION_HOST_LOOKUP", "OpenCode session identity is invalid");
    }
    let response;
    try {
      response = await client.session.get({
        path: { id: sessionID },
        ...(directory === undefined ? {} : { query: { directory } }),
      });
    } catch {
      throw new ContractError("QUALITY_SESSION_HOST_LOOKUP", "OpenCode could not resolve the session parent");
    }
    const info = response?.data;
    const parentID = info?.parentID ?? null;
    if (response?.error !== undefined || info?.id !== sessionID
      || (parentID !== null && !validSessionId(parentID))) {
      throw new ContractError("QUALITY_SESSION_HOST_LOOKUP", "OpenCode returned an invalid session-parent binding");
    }
    return Object.freeze({ id: sessionID, parentID });
  };
}

function validateResolvedSessionInfo(info, expectedSessionID) {
  if (info === null || typeof info !== "object" || Array.isArray(info)
    || info.id !== expectedSessionID || !validSessionId(info.id)
    || (info.parentID !== null && !validSessionId(info.parentID))) {
    throw new ContractError("QUALITY_SESSION_HOST_LOOKUP", "session resolver returned an invalid host binding");
  }
  return info;
}

const TOOL_DESCRIPTIONS = Object.freeze({
  quality_session_start: "Classify this registered development session and begin a mandatory quality lifecycle. In a registered primary development session, call this before native read, glob, skill discovery, todo creation, bash, checks, or delegation; use the visible task scope and allowed ownership paths, then let the runner name bounded context. request is exact JSON with risk_class, task_type, user_visible_goal, ownership_paths, classification_rationale and, for standard-lite, behavior_expectation, non-empty expected_preserved_behavior, non-empty known_local_edge_cases, and scope_facts with exactly these eight boolean keys: parallel_writable_delegation, migration, public_compatibility_change, architecture_policy_change, security_sensitive, persistence_sensitive, concurrency_sensitive, unresolved_unknowns. Trusted integration and bug-reproducer check IDs are selected and bound by the runner. After success, do not repeat session start: execute only the first runner-returned recommended_next_action, re-inspect after it settles, and continue through gate, trusted verification, review, reconciliation, and final attestation; session start is not completion.",
  quality_dossier_create: "Legacy explicit creation path for high/critical sessions that did not provide typed provisional fields at quality_session_start. Modern typed starts already return a runner-seeded provisional Engineering Dossier draft; inspect it instead of recreating it.",
  quality_dossier_update: "Refine the current high/critical provisional Dossier from observed evidence. Modern structured APIs expose a compact flat analysis and let the runner derive typed IDs, mappings, checks, and graph mechanics; legacy APIs retain exact JSON {expected_revision, patch}. The strict core validates the resulting full Dossier and never weakens the gate.",
  quality_dossier_inspect: "Inspect the bounded dossier, gate, ownership, verification status, and runner-returned recommended_next_actions. Call with no arguments on structured plugin APIs; legacy APIs use request {}.",
  quality_context_strategy_escalate: "Execute a runner-owned monotonic context-strategy escalation when inspection recommends it, including after bounded evidence discovers non-local impact. Use exactly the recommended strategy ID, then re-inspect; do not repeat reads under a strategy the runner declared insufficient.",
  quality_context_report_create: "Inspect the runner-created Whole-System Context Report draft before discovery.",
  quality_context_report_update: "Update the Whole-System Context Report from settled runner-owned context receipts. Modern structured APIs accept a compact flat analysis and the runner derives receipt bindings and report mechanics; legacy APIs retain exact JSON {expected_revision, patch}. Missing outline or file-read evidence fails closed with the exact paths still required.",
  quality_context_report_finalize: "Finalize the report and compute the runner-owned context sufficiency decision.",
  quality_architecture_evaluate: "Record a post-sufficiency architect or reviewer contribution bound to the canonical current challenge subject: current Dossier analysis, selected strategy, finalized context report analysis, runner-owned sufficient context decision, and task-profile evidence; identity comes from the host.",
  quality_dossier_finalize: "Finalize the current Dossier and evaluate the gate using the current expected_revision. For standard-lite this is the required root action immediately after bounded context collection; task, verifier, reviewer, mutation, and final success must wait for gate_status passed. Finalization alone does not authorize mutation. After a passed standard-lite gate, continue to trusted verifier/reviewer evidence even when the task is read-only and has no diff.",
  quality_action_authorize: "Request one mutation capability after a passed gate using expected_revision, kind, and exact owned paths; writable delegation additionally uses kind task and target_agent general. After authorization succeeds, inspect again: the runner will name the native edit or writable task that must consume this one-shot capability. Do not authorize the same action again while that capability is outstanding. Once a reviewer receipt passes with no unplanned items, the verified workspace is sealed: follow reconciliation and finalization instead of authorizing or attempting another mutation. A verified workspace may reopen only when the current reviewer receipt records blocked checks or unplanned items.",
  quality_project_catalog_rotate: "Recoverably bind one passed same-session run to a restarted timeout-only project catalog epoch without changing its gate-bound engineering checks.",
  quality_command_authorize: "Fail-closed compatibility sentinel: native Bash authorization is disabled; use catalog-backed trusted project checks.",
  quality_verification_record: "Ask the trusted runner to execute every canonical verification target using the current expected_revision. This step is mandatory after a passed gate even when no mutation occurred and only the verifier agent may call it; after complete:true the orchestrator must obtain reviewer evidence, reconcile, and finalize.",
  quality_context_reviewer_record: "Record mandatory reviewer-only final blast-radius evidence after trusted verification. A passed review must echo the exact runner-owned clause IDs and provide one currently read source path, one exact controlling source snippet, and one explicit input/observed/expected matching trace per clause; the runner derives exact changed paths and passed check records. Keep independently declared edge cases distinct, and use the legacy detailed request whenever actual and expected behavior differ or any clause remains unproven. Only the active runner-assigned reviewer child may pass; the orchestrator must then reconcile and finalize.",
  quality_context_reconcile: "Root-only next action after the reviewer task returns: compute final blast-radius reconciliation after trusted verification. When the current reviewer receipt passed with no unplanned items, use reviewer_grounded and let the runner derive the final changed-path manifest and empty passed-review facts. Detailed requests remain available through the legacy request field. A reviewer response is not a substitute for this call.",
  quality_session_finalize: "Root-only final quality action immediately after successful context reconciliation: request final attestation using the current expected_revision. Success returns the fingerprint-bound attestation object. Never report lifecycle success or verified termination before this tool succeeds.",
});

const STRUCTURED_SESSION_START_DESCRIPTION = "Classify this registered development session with typed fields. In a registered primary development session, call this before native read, glob, skill discovery, todo creation, bash, checks, or delegation; classify from the visible task scope and allowed ownership paths, then let the runner name bounded context. Supply every required field exactly once. Preserve every explicit conjunction, inclusion, failure case, and compatibility clause from the visible request across user_visible_goal, behavior_expectation, and known_local_edge_cases; do not shorten away an obligation just because a visible check covers one example. Use standard-lite for a bounded local repair with deterministic checks, including local async or cancellation logic, when it does not alter a declared public contract or cross shared-state, durable-persistence, security, migration, or architecture boundaries. The runner binds the declared behavior and edge cases into a compact standard-lite dossier or a conservative provisional high/critical dossier; it never treats that seed as final evidence. Trusted integration check IDs are selected and bound by the runner, not by the model. unresolved_unknowns means a known material unknown, not lack of initial inspection. For a standard-lite bug_fix, the runner selects the only available bug reproducer when unambiguous and verifies the claimed pre-fix outcome. After success, do not repeat session start: execute only the first runner-returned recommended_next_action, re-inspect after it settles, and continue until attested. The quality core reconstructs and validates the same strict closed request contract.";
const SESSION_START_SCOPE_FACT_KEYS = QUALITY_SESSION_SCOPE_FACT_KEYS;
const SESSION_START_SCOPE_FACT_DESCRIPTIONS = Object.freeze({
  parallel_writable_delegation: "Whether the task needs multiple writable workers; a single root edit is false.",
  migration: "Whether stored data, schemas, or versions require migration; ordinary code replacement is false.",
  public_compatibility_change: "Whether the requested outcome intentionally changes a declared public contract; restoring an explicitly declared existing contract is false.",
  architecture_policy_change: "Whether architecture, dependency direction, or repository policy is intentionally changed.",
  security_sensitive: "Whether the task changes a trust, authorization, credential, privacy, or hostile-input boundary.",
  persistence_sensitive: "Whether durable or external state, crash recovery, transactions, or stored records are affected; a process-local Map or cache alone is false.",
  concurrency_sensitive: "Whether correctness depends on cross-request shared-state races, locks, or multi-owner ordering; a bounded local async or AbortSignal repair with deterministic tests alone is false.",
  unresolved_unknowns: "Whether a known material unknown remains after bounded inspection; initial uncertainty or unread unrelated files alone is false.",
});
const COMPACT_DOSSIER_ANALYSIS_KEYS = Object.freeze([
  "entry_path",
  "related_paths",
  "compatibility_decision",
  "compatibility_analysis",
  "owning_abstraction",
  "impact_analysis",
  "has_downstream_side_effects",
  "side_effect_analysis",
  "has_cross_boundary_contracts",
  "contract_analysis",
  "rollback_expectation",
  "recovery_expectation",
  "counterexample",
  "premortem_analysis",
  "unresolved_unknowns",
]);
const COMPACT_CONTEXT_ANALYSIS_KEYS = Object.freeze([
  "observed_system_behavior",
  "owning_abstraction",
  "input_summary",
  "output_summary",
  "falsification_observation",
  "sibling_variant_observation",
  "compatibility_observation",
  "negative_path_observation",
  "unresolved_questions",
]);

function supportsStructuredSessionStart(toolFactory) {
  return typeof toolFactory.schema?.array === "function"
    && typeof toolFactory.schema?.boolean === "function"
    && typeof toolFactory.schema?.enum === "function";
}

function supportsStructuredCommonTools(toolFactory) {
  return supportsStructuredSessionStart(toolFactory)
    && typeof toolFactory.schema?.number === "function";
}

function structuredSessionStartArgs(toolFactory) {
  const schema = toolFactory.schema;
  const optionalString = (description) => schema.string().optional().describe(description);
  return {
    risk_class: schema.enum(["standard-lite", "high", "critical"]).describe("Use standard-lite for bounded local repairs with deterministic checks; reserve high/critical for material cross-boundary scope or the explicit scope facts below."),
    task_type: schema.enum([
      "bug_fix",
      "new_feature",
      "behavior_preserving_refactor",
      "maintenance",
      "diagnosis_driven_implementation",
      "migration",
      "security",
    ]).describe("Task type used by the quality policy."),
    user_visible_goal: schema.string().describe("Concrete user-visible outcome."),
    ownership_paths: schema.array(schema.string()).describe("Repository-relative paths owned by this task."),
    classification_rationale: schema.string().describe("Evidence-based reason for this risk classification."),
    behavior_expectation: schema.string().describe("Concrete expected outcome used by the runner-owned provisional dossier."),
    expected_preserved_behavior: schema.array(schema.string()).describe("Non-empty preservation list used by the runner-owned provisional dossier."),
    known_local_edge_cases: schema.array(schema.string()).describe("Non-empty edge-case list used by the runner-owned provisional dossier."),
    ...Object.fromEntries(SESSION_START_SCOPE_FACT_KEYS.map((key) => [
      key,
      schema.boolean().describe(SESSION_START_SCOPE_FACT_DESCRIPTIONS[key]),
    ])),
    reproduction_check_id: optionalString("Optional when the runner lists exactly one trusted bug_reproducer check; that unique runner-owned check overrides model input. Required only to select among multiple trusted checks."),
    reproduction_expected_pre_fix: schema.enum(["failing_reproducer", "unavailable"]).optional()
      .describe("Required for a standard-lite bug_fix."),
    reproduction_unavailable_reason: optionalString("Required only when reproduction_expected_pre_fix is unavailable."),
    reproduction_uncertainty_material: schema.boolean().optional()
      .describe("Whether reproduction uncertainty is material; material uncertainty requires escalation."),
  };
}

function structuredCommonToolArgs(toolId, toolFactory) {
  const schema = toolFactory.schema;
  const expectedRevision = () => schema.number().describe("Current dossier revision returned by the runner.");
  if (toolId === "quality_dossier_inspect") return {};
  if (toolId === "quality_context_strategy_escalate") {
    return {
      requested_strategy_id: schema.enum(["high-wide-deep-v1", "critical-wide-deep-v1"])
        .describe("Exact monotonic strategy ID returned by the current runner-owned recommendation."),
    };
  }
  if (toolId === "quality_dossier_update") {
    return {
      expected_revision: expectedRevision(),
      entry_path: schema.string().describe("Primary repository-relative implementation entry inside the classified ownership."),
      related_paths: schema.array(schema.string()).describe("Observed related repository paths; use an empty array when bounded inspection found none."),
      compatibility_decision: schema.enum(["preserve", "versioned", "breaking_approved", "not_applicable"])
        .describe("Resolved compatibility decision."),
      compatibility_analysis: schema.string().describe("Evidence-based compatibility rationale."),
      owning_abstraction: schema.string().describe("Concrete module or abstraction that owns the behavior."),
      impact_analysis: schema.string().describe("Concrete caller, callee, ordering, and transitive-impact analysis."),
      has_downstream_side_effects: schema.boolean().describe("Whether the implementation has downstream state or side effects."),
      side_effect_analysis: schema.string().describe("Specific side-effect analysis, including why none exist when false."),
      has_cross_boundary_contracts: schema.boolean().describe("Whether a public, serialized, config, event, or other boundary contract is affected."),
      contract_analysis: schema.string().describe("Specific cross-boundary contract analysis, including why none exist when false."),
      rollback_expectation: schema.string().describe("Concrete rollback expectation for the bounded change."),
      recovery_expectation: schema.string().describe("Concrete recovery behavior after partial failure or restart."),
      counterexample: schema.string().describe("One concrete falsifying counterexample or negative scenario."),
      premortem_analysis: schema.string().describe("Specific rationale used to classify the remaining premortem categories."),
      unresolved_unknowns: schema.array(schema.string()).describe("Material unresolved unknowns; use an empty array only when none remain."),
    };
  }
  if (toolId === "quality_context_report_update") {
    return {
      expected_revision: expectedRevision(),
      observed_system_behavior: schema.string().describe("What the settled bounded receipts show about the behavior and impact path."),
      owning_abstraction: schema.string().describe("Receipt-backed owning module or abstraction."),
      input_summary: schema.string().describe("Concrete inputs entering the critical path."),
      output_summary: schema.string().describe("Concrete outputs and externally visible effects leaving the critical path."),
      falsification_observation: schema.string().describe("Actual observation from attempting to falsify the planned behavior."),
      sibling_variant_observation: schema.string().describe("Actual bounded inventory observation about sibling variants or consumers."),
      compatibility_observation: schema.string().describe("Actual observation supporting the compatibility decision."),
      negative_path_observation: schema.string().describe("Actual observation supporting failure and negative-path handling."),
      unresolved_questions: schema.array(schema.string()).describe("Only material questions still unanswered after all current settled receipts. Use an empty array when the receipts resolve the prior question; do not carry resolved, duplicate, or merely speculative questions forward."),
    };
  }
  if ([
    "quality_context_report_finalize",
    "quality_dossier_finalize",
    "quality_verification_record",
    "quality_session_finalize",
  ].includes(toolId)) {
    return { expected_revision: expectedRevision() };
  }
  if (toolId === "quality_architecture_evaluate") {
    return {
      expected_revision: expectedRevision(),
      blocker_summaries: schema.array(schema.string())
        .describe("Concrete unresolved blockers found by this architect or reviewer; use an empty array only when the current challenge subject passes."),
    };
  }
  if (toolId === "quality_action_authorize") {
    return {
      expected_revision: expectedRevision(),
      kind: schema.enum(["edit", "task"]).describe("Use edit for a direct mutation or task for writable delegation."),
      paths: schema.array(schema.string()).describe("Exact repository-relative owned paths for this one-shot capability."),
      target_agent: schema.string().optional().describe("Use general only when kind is task; omit for edit."),
    };
  }
  if (toolId === "quality_context_reviewer_record") {
    return {
      outcome: schema.enum(["passed"]).optional().describe("Use passed only after every runner-owned review clause has distinct grounded evidence."),
      reviewed_clause_ids: schema.array(schema.string()).optional()
        .describe("Exact ordered required_clause_ids from the runner-owned reviewer assignment."),
      clause_evidence_paths: schema.array(schema.string()).optional()
        .describe("One currently context_read repository path per reviewed clause, in the same order."),
      clause_evidence_snippets: schema.array(schema.string()).optional()
        .describe("One exact controlling source snippet copied from the cited current path per reviewed clause, in the same order."),
      clause_evidence_summaries: schema.array(schema.string()).optional()
        .describe("One distinct `input=...; observed=...; expected=...; verdict=match` trace per reviewed clause, in the same order."),
      request: schema.string().optional().describe("Legacy strict JSON envelope, used only when review found details that must be recorded."),
    };
  }
  if (toolId === "quality_context_reconcile") {
    return {
      evidence_mode: schema.enum(["reviewer_grounded"]).optional().describe("Use reviewer_grounded after a passed reviewer receipt with no unplanned items."),
      request: schema.string().optional().describe("Legacy strict JSON envelope for detailed or extractor-grounded reconciliation."),
    };
  }
  return {
    request: schema.string().describe("Strict JSON request envelope. Unknown JSON fields are rejected by the quality core."),
  };
}

function structuredSessionStartRequest(args, inspection) {
  const availableCheckIds = inspection?.available_check_ids ?? [];
  const availableReproducerCheckIds = inspection?.available_reproducer_check_ids ?? [];
  const scopeFacts = Object.fromEntries(SESSION_START_SCOPE_FACT_KEYS.map((key) => [key, args[key]]));
  const runnerMinimumRiskClass = args.risk_class === "standard-lite"
    && (["migration", "security"].includes(args.task_type) || Object.values(scopeFacts).some(Boolean))
    ? "high"
    : args.risk_class;
  const request = {
    risk_class: runnerMinimumRiskClass,
    task_type: args.task_type,
    user_visible_goal: args.user_visible_goal,
    ownership_paths: args.ownership_paths,
    required_check_ids: availableCheckIds,
    classification_rationale: args.classification_rationale,
    behavior_expectation: args.behavior_expectation,
    expected_preserved_behavior: args.expected_preserved_behavior,
    known_local_edge_cases: args.known_local_edge_cases,
    scope_facts: scopeFacts,
  };
  if (runnerMinimumRiskClass === "standard-lite") {
    if (args.task_type === "bug_fix") {
      const reproducerCheckId = availableReproducerCheckIds.length === 1
        ? availableReproducerCheckIds[0]
        : args.reproduction_check_id;
      const expectedPreFix = args.reproduction_expected_pre_fix ?? "failing_reproducer";
      request.reproduction_contract = {
        check_id: reproducerCheckId,
        expected_pre_fix: expectedPreFix,
        expected_post_fix: "passing_regression",
        unavailable_reason: expectedPreFix === "unavailable"
          ? (args.reproduction_unavailable_reason ?? "")
          : null,
        uncertainty_material: args.reproduction_uncertainty_material ?? false,
      };
    }
  }
  return request;
}

function legacySessionStartRequest(serialized, inspection) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return serialized;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return serialized;
  const request = {
    ...parsed,
    required_check_ids: inspection?.available_check_ids ?? [],
  };
  if (request.risk_class === "standard-lite" && request.task_type === "bug_fix") {
    const availableReproducerCheckIds = inspection?.available_reproducer_check_ids ?? [];
    const supplied = request.reproduction_contract !== null
      && typeof request.reproduction_contract === "object"
      && !Array.isArray(request.reproduction_contract)
      ? request.reproduction_contract
      : {};
    const expectedPreFix = supplied.expected_pre_fix ?? "failing_reproducer";
    request.reproduction_contract = {
      ...supplied,
      check_id: availableReproducerCheckIds.length === 1
        ? availableReproducerCheckIds[0]
        : supplied.check_id,
      expected_pre_fix: expectedPreFix,
      expected_post_fix: "passing_regression",
      unavailable_reason: expectedPreFix === "unavailable"
        ? (supplied.unavailable_reason ?? "")
        : null,
      uncertainty_material: supplied.uncertainty_material ?? false,
    };
  }
  return JSON.stringify(request);
}

function normalizedPluginToolArgs(toolId, args, structuredTools, bridge, context) {
  if (toolId !== "quality_session_start" && typeof args?.request === "string") return args;
  if (structuredTools) {
    if (toolId === "quality_dossier_inspect") return { request: "{}" };
    if (toolId === "quality_context_strategy_escalate") {
      return { request: JSON.stringify({ requested_strategy_id: args?.requested_strategy_id }) };
    }
    if (toolId === "quality_dossier_update") {
      return { request: JSON.stringify({
        expected_revision: args?.expected_revision,
        compact_analysis: Object.fromEntries(COMPACT_DOSSIER_ANALYSIS_KEYS.map((key) => [key, args?.[key]])),
      }) };
    }
    if (toolId === "quality_context_report_update") {
      return { request: JSON.stringify({
        expected_revision: args?.expected_revision,
        compact_analysis: Object.fromEntries(COMPACT_CONTEXT_ANALYSIS_KEYS.map((key) => [key, args?.[key]])),
      }) };
    }
    if ([
      "quality_context_report_finalize",
      "quality_dossier_finalize",
      "quality_verification_record",
      "quality_session_finalize",
    ].includes(toolId)) {
      return { request: JSON.stringify({ expected_revision: args?.expected_revision }) };
    }
    if (toolId === "quality_architecture_evaluate") {
      return { request: JSON.stringify({
        expected_revision: args?.expected_revision,
        blockers: (args?.blocker_summaries ?? []).map((summary) => ({
          severity: "high",
          summary,
          resolved: false,
        })),
      }) };
    }
    if (toolId === "quality_action_authorize") {
      const request = {
        expected_revision: args?.expected_revision,
        kind: args?.kind,
        paths: args?.paths,
      };
      if (args?.target_agent !== undefined) request.target_agent = args.target_agent;
      return { request: JSON.stringify(request) };
    }
    if (toolId === "quality_context_reviewer_record" && args?.outcome === "passed") {
      return { request: JSON.stringify({
        outcome: "passed",
        reviewed_clause_ids: args?.reviewed_clause_ids,
        clause_evidence_paths: args?.clause_evidence_paths,
        clause_evidence_snippets: args?.clause_evidence_snippets,
        clause_evidence_summaries: args?.clause_evidence_summaries,
      }) };
    }
    if (toolId === "quality_context_reconcile" && args?.evidence_mode === "reviewer_grounded") {
      return { request: JSON.stringify({ evidence_mode: "reviewer_grounded" }) };
    }
  }
  if (toolId !== "quality_session_start") return args;
  const inspection = executeNormalSessionQualityTool(
    bridge,
    "quality_dossier_inspect",
    { request: "{}" },
    context,
  );
  if (typeof args?.request === "string") {
    return { request: legacySessionStartRequest(args.request, inspection) };
  }
  if (!structuredTools) return args;
  return { request: JSON.stringify(structuredSessionStartRequest(args ?? {}, inspection)) };
}

function appendTaskQualityContinuation(bridge, input, output) {
  if (input?.tool !== "task" || output === null || typeof output !== "object") return;
  const inspection = executeNormalSessionQualityTool(
    bridge,
    "quality_dossier_inspect",
    { request: "{}" },
    { sessionID: input.sessionID, agent: "orchestrator" },
  );
  if (!Array.isArray(inspection.recommended_next_actions)
    || inspection.recommended_next_actions.length === 0
    || inspection.lifecycle === "attested") return;
  const continuation = {
    lifecycle: inspection.lifecycle,
    instruction: "The delegated task has settled, but the caller quality lifecycle is incomplete. Continue in the caller session with the first recommended_next_action before reporting success.",
    recommended_next_actions: inspection.recommended_next_actions,
    incomplete_reasons: inspection.incomplete_reasons,
  };
  if (typeof output.output === "string" && !output.output.includes(TASK_QUALITY_CONTINUATION_MARKER)) {
    output.output = `${output.output}\n\n${TASK_QUALITY_CONTINUATION_MARKER}\n${JSON.stringify(continuation)}`;
  }
  const priorMetadata = output.metadata !== null
    && typeof output.metadata === "object"
    && !Array.isArray(output.metadata)
    ? output.metadata
    : {};
  output.metadata = { ...priorMetadata, quality_continuation: continuation };
}

export function createNormalSessionQualityToolSurface({ toolFactory, bridge }) {
  if (!toolFactory || typeof toolFactory !== "function" || !toolFactory.schema?.string) {
    throw new ContractError("QUALITY_PLUGIN_API", "installed @opencode-ai/plugin tool factory is unavailable or incompatible");
  }
  const structuredSessionStart = supportsStructuredSessionStart(toolFactory);
  const structuredTools = supportsStructuredCommonTools(toolFactory);
  return Object.fromEntries(NORMAL_SESSION_QUALITY_TOOL_IDS.map((toolId) => [toolId, toolFactory({
    description: toolId === "quality_session_start" && structuredSessionStart
      ? STRUCTURED_SESSION_START_DESCRIPTION
      : TOOL_DESCRIPTIONS[toolId],
    args: toolId === "quality_session_start" && structuredSessionStart
      ? structuredSessionStartArgs(toolFactory)
      : structuredTools
        ? structuredCommonToolArgs(toolId, toolFactory)
        : {
          request: toolFactory.schema.string().describe("Strict JSON request envelope. Unknown JSON fields are rejected by the quality core."),
    },
    async execute(args, context) {
      const invoke = (candidateArgs) => executeNormalSessionQualityTool(
        bridge,
        toolId,
        normalizedPluginToolArgs(
          toolId,
          candidateArgs,
          toolId === "quality_session_start" ? structuredSessionStart : structuredTools,
          bridge,
          context,
        ),
        context,
      );
      const invokeWithRegistrationRecovery = (candidateArgs) => {
        try {
          return invoke(candidateArgs);
        } catch (error) {
          const canRecoverMissingChatRegistration = toolId === "quality_session_start"
            && error instanceof ContractError
            && error.code === "QUALITY_SESSION_UNCLASSIFIED"
            && typeof context?.sessionID === "string"
            && typeof context?.agent === "string";
          if (!canRecoverMissingChatRegistration) throw error;
          handleNormalSessionChatMessage(bridge, {
            sessionID: context.sessionID,
            agent: context.agent,
          });
          return invoke(candidateArgs);
        }
      };

      const receipt = invokeWithRegistrationRecovery(args);
      return `${JSON.stringify(receipt)}\n`;
    },
  })]));
}

export function createNormalSessionQualityPlugin({
  toolFactory,
  workspaceRoot,
  bridge: suppliedBridge = null,
  bridgeOptions = {},
  hostToolchainAnchorUrl = undefined,
  hostToolchainConfigurationLease = undefined,
  sessionInfoResolver = null,
}) {
  if (bridgeOptions === null || typeof bridgeOptions !== "object" || Array.isArray(bridgeOptions)) {
    throw new ContractError("QUALITY_PLUGIN_API", "normal-session bridge options must be an object");
  }
  if (Object.hasOwn(bridgeOptions, "hostToolchainAnchorUrl")
    || Object.hasOwn(bridgeOptions, "hostToolchainConfigurationLease")) {
    throw new ContractError(
      "QUALITY_TOOLCHAIN_HOST_CONFIG_BOUNDARY",
      "trusted host toolchain configuration must cross the explicit plugin host boundary",
    );
  }
  if (sessionInfoResolver !== null && typeof sessionInfoResolver !== "function") {
    throw new ContractError("QUALITY_PLUGIN_API", "sessionInfoResolver must be a function when supplied");
  }
  if (suppliedBridge !== null && (typeof suppliedBridge !== "object" || Array.isArray(suppliedBridge))) {
    throw new ContractError("QUALITY_PLUGIN_API", "supplied normal-session bridge must be an object");
  }
  if (suppliedBridge !== null && (Object.keys(bridgeOptions).length > 0
    || hostToolchainAnchorUrl !== undefined || hostToolchainConfigurationLease !== undefined)) {
    throw new ContractError(
      "QUALITY_PLUGIN_API",
      "a supplied normal-session bridge cannot be combined with bridge construction options",
    );
  }
  const bridge = suppliedBridge ?? createNormalSessionQualityBridge({
    ...bridgeOptions,
    workspaceRoot,
    ...(hostToolchainAnchorUrl === undefined ? {} : { hostToolchainAnchorUrl }),
    ...(hostToolchainConfigurationLease === undefined ? {} : { hostToolchainConfigurationLease }),
  });
  const boundHostSessions = new Set();
  const pendingHostBindings = new Map();
  const bindHostSession = async (input) => {
    if (sessionInfoResolver === null || !validSessionId(input?.sessionID)
      || boundHostSessions.has(input.sessionID)) return;
    let pending = pendingHostBindings.get(input.sessionID);
    if (pending === undefined) {
      pending = (async () => {
        const info = validateResolvedSessionInfo(
          await sessionInfoResolver(input.sessionID),
          input.sessionID,
        );
        if (info.parentID !== null) {
          handleNormalSessionEvent(bridge, {
            type: "session.created",
            properties: { info: { id: info.id, parentID: info.parentID } },
          });
        }
        boundHostSessions.add(input.sessionID);
      })();
      pendingHostBindings.set(input.sessionID, pending);
    }
    try {
      await pending;
    } finally {
      if (pendingHostBindings.get(input.sessionID) === pending) {
        pendingHostBindings.delete(input.sessionID);
      }
    }
  };
  return Object.freeze({
    tool: createNormalSessionQualityToolSurface({ toolFactory, bridge }),
    async "chat.message"(input) {
      await bindHostSession(input);
      handleNormalSessionChatMessage(bridge, input);
    },
    async "permission.ask"(input, output) {
      handleNormalSessionPermission(bridge, input, output);
    },
    async "tool.execute.before"(input, output) {
      handleNormalSessionToolBefore(bridge, input, output);
    },
    async "tool.execute.after"(input, output) {
      handleNormalSessionToolAfter(bridge, input, output);
      appendTaskQualityContinuation(bridge, input, output);
    },
    async event(input) {
      handleNormalSessionEvent(bridge, input?.event);
    },
  });
}
