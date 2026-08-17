import {
  createNormalSessionQualityBridge,
  executeNormalSessionQualityTool,
  handleNormalSessionChatMessage,
  handleNormalSessionEvent,
  handleNormalSessionPermission,
  handleNormalSessionToolAfter,
  handleNormalSessionToolBefore,
} from "./normal-session-bridge.mjs";
import { ContractError } from "./validation.mjs";

export const ASSURANCE_FACADE_TOOL_IDS = Object.freeze([
  "quality_assurance_start",
  "quality_assurance_inspect",
  "quality_assurance_advance",
  "quality_assurance_authorize",
]);

const ADVANCE_TRANSITIONS = Object.freeze({
  "dossier-create": "quality_dossier_create",
  "dossier-update": "quality_dossier_update",
  "context-strategy-escalate": "quality_context_strategy_escalate",
  "context-report-create": "quality_context_report_create",
  "context-report-update": "quality_context_report_update",
  "context-report-finalize": "quality_context_report_finalize",
  "architecture-evaluate": "quality_architecture_evaluate",
  "dossier-finalize": "quality_dossier_finalize",
  "project-catalog-rotate": "quality_project_catalog_rotate",
  "verification-record": "quality_verification_record",
  "context-reviewer-record": "quality_context_reviewer_record",
  "context-reconcile": "quality_context_reconcile",
  "session-finalize": "quality_session_finalize",
});

const TOOL_TO_TRANSITION = Object.freeze(Object.fromEntries(
  Object.entries(ADVANCE_TRANSITIONS).map(([transition, toolId]) => [toolId, transition]),
));

const DOSSIER_REVISION_TOOLS = new Set([
  "quality_dossier_update",
  "quality_architecture_evaluate",
  "quality_dossier_finalize",
  "quality_verification_record",
  "quality_session_finalize",
]);

const CONTEXT_REPORT_REVISION_TOOLS = new Set([
  "quality_context_report_update",
  "quality_context_report_finalize",
]);

const FACADE_DESCRIPTIONS = Object.freeze({
  quality_assurance_start: "Start one explicit experimental assurance lifecycle. The facade binds host-selected checks and runner-owned identity; pass the visible task contract as strict JSON. This operation never authorizes mutation.",
  quality_assurance_inspect: "Inspect the current assurance lifecycle and receive exactly one facade or native next step. No revision or internal tool ID is supplied by the agent.",
  quality_assurance_advance: "Perform the current runner-selected non-mutation assurance transition. The facade injects the current runner-owned revision and preserves role separation, replay protection, and fail-closed state.",
  quality_assurance_authorize: "Request one bounded edit or general-worker capability only when the current runner-selected next step permits it. The facade injects the current revision and never widens paths.",
});

const FACADE_TASK_CONTINUATION_MARKER = "OPENCODE_ASSURANCE_FACADE_CONTINUATION_V1";

function parseRequest(value, label, { optional = false } = {}) {
  if (value === undefined && optional) return {};
  if (typeof value !== "string" || value.length === 0) {
    throw new ContractError("QUALITY_FACADE_REQUEST", `${label} must be a non-empty JSON string`);
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ContractError("QUALITY_FACADE_REQUEST", `${label} must be valid JSON`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ContractError("QUALITY_FACADE_REQUEST", `${label} must decode to an object`);
  }
  return parsed;
}

function inspectRaw(bridge, context) {
  return executeNormalSessionQualityTool(
    bridge,
    "quality_dossier_inspect",
    { request: "{}" },
    context,
  );
}

function facadeToolId(toolId) {
  if (toolId === "quality_session_start") return "quality_assurance_start";
  if (toolId === "quality_action_authorize") return "quality_assurance_authorize";
  if (Object.hasOwn(TOOL_TO_TRANSITION, toolId)) return "quality_assurance_advance";
  return toolId;
}

function facadeInspection(raw) {
  const actions = (raw.recommended_next_actions ?? []).slice(0, 1).map((action) => {
    const mapped = {
      facade_operation: facadeToolId(action.tool_id),
      reason: action.reason,
    };
    if (Object.hasOwn(TOOL_TO_TRANSITION, action.tool_id)) {
      mapped.transition = TOOL_TO_TRANSITION[action.tool_id];
    }
    if (action.target_agent !== undefined) mapped.target_agent = action.target_agent;
    if (action.request !== undefined) {
      const { expected_revision: _ignored, ...request } = action.request;
      if (Object.keys(request).length > 0) mapped.request = request;
    }
    if (action.request_requirements !== undefined) {
      const { expected_revision: _ignored, ...requirements } = action.request_requirements;
      if (Object.keys(requirements).length > 0) mapped.request_requirements = requirements;
    }
    return mapped;
  });
  return Object.freeze({
    schema_version: 1,
    facade_id: "assurance-facade-v1",
    lifecycle: raw.lifecycle,
    risk_class: raw.risk_class,
    gate_status: raw.gate_status,
    verification_complete: raw.verification_complete,
    mutation_pending: raw.mutation_pending ?? false,
    next_actions: actions,
    incomplete_reasons: raw.incomplete_reasons ?? [],
  });
}

function nextInternalQualityTool(inspection, transition) {
  if (transition !== undefined) {
    if (!Object.hasOwn(ADVANCE_TRANSITIONS, transition)) {
      throw new ContractError("QUALITY_FACADE_TRANSITION", "unknown assurance transition");
    }
    return ADVANCE_TRANSITIONS[transition];
  }
  const next = inspection.recommended_next_actions?.[0];
  if (!next || !Object.hasOwn(TOOL_TO_TRANSITION, next.tool_id)) {
    throw new ContractError("QUALITY_FACADE_NEXT_ACTION", "the current next step is native or requires another facade operation");
  }
  return next.tool_id;
}

function currentRevision(inspection, toolId) {
  if (DOSSIER_REVISION_TOOLS.has(toolId)) return inspection.dossier_revision;
  if (CONTEXT_REPORT_REVISION_TOOLS.has(toolId)) return inspection.context_report_revision;
  return null;
}

function injectRevision(payload, inspection, toolId) {
  const expectedRevision = currentRevision(inspection, toolId);
  if (expectedRevision === null) return payload;
  if (Object.hasOwn(payload, "expected_revision") && payload.expected_revision !== expectedRevision) {
    throw new ContractError("QUALITY_FACADE_REVISION", "caller-supplied revision is stale or does not match runner state");
  }
  return { ...payload, expected_revision: expectedRevision };
}

function recommendedInternalTool(inspection) {
  return inspection.recommended_next_actions?.[0]?.tool_id ?? null;
}

function executeStart(bridge, args, context) {
  let inspection;
  try {
    inspection = inspectRaw(bridge, context);
  } catch (error) {
    const recoverable = error instanceof ContractError
      && error.code === "QUALITY_SESSION_UNCLASSIFIED"
      && typeof context?.sessionID === "string";
    if (!recoverable) throw error;
    handleNormalSessionChatMessage(bridge, context);
    inspection = inspectRaw(bridge, context);
  }
  if (inspection.lifecycle !== "unclassified") {
    throw new ContractError("QUALITY_FACADE_LIFECYCLE", "assurance session has already started");
  }
  const payload = parseRequest(args.request, "assurance start request");
  payload.required_check_ids = inspection.available_check_ids ?? [];
  if (payload.risk_class === "standard-lite" && payload.task_type === "bug_fix") {
    const available = inspection.available_reproducer_check_ids ?? [];
    const supplied = payload.reproduction_contract ?? {};
    const expectedPreFix = supplied.expected_pre_fix ?? "failing_reproducer";
    payload.reproduction_contract = {
      ...supplied,
      check_id: available.length === 1 ? available[0] : supplied.check_id,
      expected_pre_fix: expectedPreFix,
      expected_post_fix: "passing_regression",
      unavailable_reason: expectedPreFix === "unavailable" ? (supplied.unavailable_reason ?? "") : null,
      uncertainty_material: supplied.uncertainty_material ?? false,
    };
  }
  const receipt = executeNormalSessionQualityTool(
    bridge,
    "quality_session_start",
    { request: JSON.stringify(payload) },
    context,
  );
  return facadeInspection(receipt);
}

function executeAdvance(bridge, args, context) {
  const inspection = inspectRaw(bridge, context);
  const toolId = nextInternalQualityTool(inspection, args.transition);
  if (recommendedInternalTool(inspection) !== toolId) {
    throw new ContractError(
      "QUALITY_FACADE_NEXT_ACTION",
      "facade transition does not match the current runner-selected action",
    );
  }
  const payload = injectRevision(
    parseRequest(args.request, "assurance advance request", { optional: true }),
    inspection,
    toolId,
  );
  const receipt = executeNormalSessionQualityTool(
    bridge,
    toolId,
    { request: JSON.stringify(payload) },
    context,
  );
  return facadeInspection(receipt);
}

function executeAuthorize(bridge, args, context) {
  const inspection = inspectRaw(bridge, context);
  if (recommendedInternalTool(inspection) !== "quality_action_authorize") {
    throw new ContractError("QUALITY_FACADE_NEXT_ACTION", "mutation authorization is not the current runner-selected action");
  }
  const request = {
    expected_revision: inspection.dossier_revision,
    kind: args.kind,
    paths: args.paths,
    ...(args.target_agent === undefined ? {} : { target_agent: args.target_agent }),
  };
  const receipt = executeNormalSessionQualityTool(
    bridge,
    "quality_action_authorize",
    { request: JSON.stringify(request) },
    context,
  );
  return facadeInspection(receipt);
}

export function createAssuranceFacadeToolSurface({ toolFactory, bridge }) {
  if (!toolFactory || typeof toolFactory !== "function" || !toolFactory.schema?.string) {
    throw new ContractError("QUALITY_PLUGIN_API", "installed tool factory is unavailable or incompatible");
  }
  const schema = toolFactory.schema;
  return Object.freeze({
    quality_assurance_start: toolFactory({
      description: FACADE_DESCRIPTIONS.quality_assurance_start,
      args: {
        request: schema.string().describe("Strict JSON task contract. Runner-owned check IDs are injected by the facade."),
      },
      async execute(args, context) {
        return `${JSON.stringify(executeStart(bridge, args, context))}\n`;
      },
    }),
    quality_assurance_inspect: toolFactory({
      description: FACADE_DESCRIPTIONS.quality_assurance_inspect,
      args: {},
      async execute(_args, context) {
        return `${JSON.stringify(facadeInspection(inspectRaw(bridge, context)))}\n`;
      },
    }),
    quality_assurance_advance: toolFactory({
      description: FACADE_DESCRIPTIONS.quality_assurance_advance,
      args: {
        transition: schema.enum(Object.keys(ADVANCE_TRANSITIONS)).optional()
          .describe("Use only the transition supplied in a runner-owned child assignment; root normally omits it."),
        request: schema.string().optional()
          .describe("Strict JSON payload without a revision. The facade injects the current runner-owned revision."),
      },
      async execute(args, context) {
        return `${JSON.stringify(executeAdvance(bridge, args, context))}\n`;
      },
    }),
    quality_assurance_authorize: toolFactory({
      description: FACADE_DESCRIPTIONS.quality_assurance_authorize,
      args: {
        kind: schema.enum(["edit", "task"]),
        paths: schema.array(schema.string()),
        target_agent: schema.string().optional(),
      },
      async execute(args, context) {
        return `${JSON.stringify(executeAuthorize(bridge, args, context))}\n`;
      },
    }),
  });
}

function validSessionId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1000
    && !/[\r\n\0]/u.test(value);
}

function rewriteRoleAssignmentForFacade(input, output) {
  if (input?.tool !== "task" || typeof output?.args?.prompt !== "string") return;
  output.args.prompt = output.args.prompt
    .replace(/"tool_id":"quality_architecture_evaluate"/gu, '"tool_id":"quality_assurance_advance","transition":"architecture-evaluate"')
    .replace(/"tool_id":"quality_verification_record"/gu, '"tool_id":"quality_assurance_advance","transition":"verification-record"')
    .replace(/"tool_id":"quality_context_reviewer_record"/gu, '"tool_id":"quality_assurance_advance","transition":"context-reviewer-record"')
    .replace(/quality_architecture_evaluate/gu, "quality_assurance_advance")
    .replace(/quality_verification_record/gu, "quality_assurance_advance")
    .replace(/quality_context_reviewer_record/gu, "quality_assurance_advance");
}

function appendFacadeTaskContinuation(bridge, input, output) {
  if (input?.tool !== "task" || output === null || typeof output !== "object") return;
  const inspection = facadeInspection(inspectRaw(bridge, {
    sessionID: input.sessionID,
    agent: "assurance",
  }));
  if (inspection.lifecycle === "attested" || inspection.next_actions.length === 0) return;
  const continuation = {
    lifecycle: inspection.lifecycle,
    instruction: "The delegated task settled, but assurance is incomplete. Continue with the first facade next action before reporting success.",
    next_actions: inspection.next_actions,
    incomplete_reasons: inspection.incomplete_reasons,
  };
  if (typeof output.output === "string" && !output.output.includes(FACADE_TASK_CONTINUATION_MARKER)) {
    output.output = `${output.output}\n\n${FACADE_TASK_CONTINUATION_MARKER}\n${JSON.stringify(continuation)}`;
  }
  const metadata = output.metadata !== null && typeof output.metadata === "object"
    && !Array.isArray(output.metadata) ? output.metadata : {};
  output.metadata = { ...metadata, assurance_facade_continuation: continuation };
}

export function createAssuranceFacadePlugin({
  toolFactory,
  workspaceRoot,
  bridgeOptions = {},
  hostToolchainAnchorUrl = undefined,
  hostToolchainConfigurationLease = undefined,
  sessionInfoResolver = null,
}) {
  if (bridgeOptions === null || typeof bridgeOptions !== "object" || Array.isArray(bridgeOptions)) {
    throw new ContractError("QUALITY_PLUGIN_API", "assurance bridge options must be an object");
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
  const bridge = createNormalSessionQualityBridge({
    ...bridgeOptions,
    workspaceRoot,
    ...(hostToolchainAnchorUrl === undefined ? {} : { hostToolchainAnchorUrl }),
    ...(hostToolchainConfigurationLease === undefined ? {} : { hostToolchainConfigurationLease }),
  });
  const boundSessions = new Set();
  const pendingBindings = new Map();
  const bindHostSession = async (input) => {
    if (sessionInfoResolver === null || !validSessionId(input?.sessionID)
      || boundSessions.has(input.sessionID)) return;
    let pending = pendingBindings.get(input.sessionID);
    if (pending === undefined) {
      pending = (async () => {
        const info = await sessionInfoResolver(input.sessionID);
        if (!info || info.id !== input.sessionID || !validSessionId(info.id)
          || (info.parentID !== null && !validSessionId(info.parentID))) {
          throw new ContractError("QUALITY_SESSION_HOST_LOOKUP", "session resolver returned an invalid host binding");
        }
        if (info.parentID !== null) {
          handleNormalSessionEvent(bridge, {
            type: "session.created",
            properties: { info: { id: info.id, parentID: info.parentID } },
          });
        }
        boundSessions.add(input.sessionID);
      })();
      pendingBindings.set(input.sessionID, pending);
    }
    try {
      await pending;
    } finally {
      if (pendingBindings.get(input.sessionID) === pending) {
        pendingBindings.delete(input.sessionID);
      }
    }
  };
  return Object.freeze({
    tool: createAssuranceFacadeToolSurface({ toolFactory, bridge }),
    async "chat.message"(input) {
      await bindHostSession(input);
      handleNormalSessionChatMessage(bridge, input);
    },
    async "permission.ask"(input, output) {
      handleNormalSessionPermission(bridge, input, output);
    },
    async "tool.execute.before"(input, output) {
      handleNormalSessionToolBefore(bridge, input, output);
      rewriteRoleAssignmentForFacade(input, output);
    },
    async "tool.execute.after"(input, output) {
      handleNormalSessionToolAfter(bridge, input, output);
      appendFacadeTaskContinuation(bridge, input, output);
    },
    async event(input) {
      handleNormalSessionEvent(bridge, input?.event);
    },
  });
}
