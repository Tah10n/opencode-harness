import {
  assertNativeTaskPromptWithinLimit,
  createNormalSessionQualityBridge,
  executeNormalSessionQualityTool,
  handleNormalSessionChatMessage,
  handleNormalSessionEvent,
  handleNormalSessionPermission,
  handleNormalSessionToolAfter,
  handleNormalSessionToolBefore,
  inspectNormalSessionStartReplayBinding,
} from "./normal-session-bridge.mjs";
import { ContractError } from "./validation.mjs";

export const ASSURANCE_FACADE_TOOL_IDS = Object.freeze([
  "quality_assurance_start",
  "quality_assurance_inspect",
  "quality_assurance_advance",
  "quality_assurance_authorize",
]);

const ADVANCE_TRANSITION_SPECS = Object.freeze({
  "dossier-update": Object.freeze({ toolId: "quality_dossier_update", revision: "dossier" }),
  "context-strategy-escalate": Object.freeze({
    toolId: "quality_context_strategy_escalate",
    actionBindings: Object.freeze(["requested_strategy_id"]),
  }),
  "context-report-update": Object.freeze({ toolId: "quality_context_report_update", revision: "context-report" }),
  "context-report-finalize": Object.freeze({ toolId: "quality_context_report_finalize", revision: "context-report" }),
  "architecture-evaluate": Object.freeze({
    toolId: "quality_architecture_evaluate",
    revision: "dossier",
    actionBindings: Object.freeze(["expected_subject_fingerprint"]),
  }),
  "dossier-finalize": Object.freeze({ toolId: "quality_dossier_finalize", revision: "dossier" }),
  "verification-record": Object.freeze({ toolId: "quality_verification_record", revision: "dossier" }),
  "context-reviewer-record": Object.freeze({ toolId: "quality_context_reviewer_record" }),
  "context-reconcile": Object.freeze({
    toolId: "quality_context_reconcile",
    actionBindings: Object.freeze(["evidence_mode"]),
  }),
  "session-finalize": Object.freeze({ toolId: "quality_session_finalize", revision: "dossier" }),
});

const ADVANCE_TRANSITIONS = Object.freeze(Object.fromEntries(
  Object.entries(ADVANCE_TRANSITION_SPECS).map(([transition, spec]) => [transition, spec.toolId]),
));

const TOOL_TO_TRANSITION = Object.freeze(Object.fromEntries(
  Object.entries(ADVANCE_TRANSITIONS).map(([transition, toolId]) => [toolId, transition]),
));

const RUNNER_OWNED_REQUEST_FIELDS = new Set([
  "required_check_ids",
  "expected_revision",
  "expected_dossier_revision",
  "requested_strategy_id",
  "evidence_mode",
  "expected_subject_fingerprint",
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

function visibleRequest(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !RUNNER_OWNED_REQUEST_FIELDS.has(key)));
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
      const request = visibleRequest(action.request);
      if (Object.keys(request).length > 0) mapped.request = request;
    }
    if (action.request_requirements !== undefined) {
      const requirements = visibleRequest(action.request_requirements);
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

function recommendedInternalTool(inspection) {
  return inspection.recommended_next_actions?.[0]?.tool_id ?? null;
}

function selectedTransition(inspection, transition, context) {
  const next = inspection.recommended_next_actions?.[0];
  if (transition === undefined) {
    if (!next || !Object.hasOwn(TOOL_TO_TRANSITION, next.tool_id)) {
      throw new ContractError("QUALITY_FACADE_NEXT_ACTION", "the current next step is native or requires another facade operation");
    }
    return { transition: TOOL_TO_TRANSITION[next.tool_id], spec: ADVANCE_TRANSITION_SPECS[TOOL_TO_TRANSITION[next.tool_id]], source: next };
  }
  const spec = ADVANCE_TRANSITION_SPECS[transition];
  if (spec === undefined) throw new ContractError("QUALITY_FACADE_TRANSITION", "unknown assurance transition");
  if (next?.tool_id === spec.toolId) return { transition, spec, source: next };
  const assignment = next?.tool_id === "task" ? next.assignment : null;
  const childAuthorized = assignment !== null && typeof assignment === "object" && !Array.isArray(assignment)
    && next.target_agent === context?.agent && assignment.tool_id === spec.toolId;
  if (!childAuthorized) {
    throw new ContractError(
      "QUALITY_FACADE_NEXT_ACTION",
      "facade transition does not match the current runner-selected root action or bound child assignment",
    );
  }
  return { transition, spec, source: assignment };
}

function bindAdvancePayload(callerPayload, inspection, selected) {
  for (const field of RUNNER_OWNED_REQUEST_FIELDS) {
    if (Object.hasOwn(callerPayload, field)) {
      throw new ContractError("QUALITY_FACADE_RUNNER_FIELD", `${field} is runner-owned and must not be supplied by the caller`);
    }
  }
  const payload = { ...callerPayload };
  for (const field of selected.spec.actionBindings ?? []) {
    const value = field === "expected_subject_fingerprint"
      ? selected.source?.challenge_subject?.fingerprint
      : selected.source?.request?.[field];
    if (value === undefined) {
      throw new ContractError("QUALITY_FACADE_BINDING", `runner-selected ${selected.transition} action is missing ${field}`);
    }
    payload[field] = value;
  }
  if (selected.spec.revision === "dossier") {
    if (!Number.isSafeInteger(inspection.dossier_revision)) {
      throw new ContractError("QUALITY_FACADE_BINDING", "current dossier revision is unavailable");
    }
    payload.expected_revision = inspection.dossier_revision;
  } else if (selected.spec.revision === "context-report") {
    if (!Number.isSafeInteger(inspection.context_report_revision)) {
      throw new ContractError("QUALITY_FACADE_BINDING", "current context report revision is unavailable");
    }
    payload.expected_revision = inspection.context_report_revision;
  }
  if (selected.spec.toolId === "quality_architecture_evaluate") {
    if (Object.hasOwn(payload, "blockers") && Object.hasOwn(payload, "blocker_summaries")) {
      throw new ContractError("QUALITY_FACADE_REQUEST", "architecture request cannot contain both blockers and blocker_summaries");
    }
    if (Object.hasOwn(payload, "blocker_summaries")) {
      payload.blockers = payload.blocker_summaries;
      delete payload.blocker_summaries;
    }
  }
  return payload;
}

function canonicalStartReproductionContract(suppliedValue, reproducerCheckIds, registered = null) {
  const supplied = suppliedValue ?? {};
  const expectedPreFix = Object.hasOwn(supplied, "expected_pre_fix")
    ? supplied.expected_pre_fix
    : (registered?.expected_pre_fix ?? "failing_reproducer");
  const uniqueReproducerCheckId = reproducerCheckIds.length === 1
    ? reproducerCheckIds[0]
    : null;
  return {
    ...supplied,
    check_id: uniqueReproducerCheckId
      ?? (Object.hasOwn(supplied, "check_id") ? supplied.check_id : registered?.check_id),
    expected_pre_fix: expectedPreFix,
    expected_post_fix: "passing_regression",
    unavailable_reason: expectedPreFix === "unavailable"
      ? (Object.hasOwn(supplied, "unavailable_reason")
        ? supplied.unavailable_reason
        : (registered?.unavailable_reason ?? ""))
      : null,
    uncertainty_material: Object.hasOwn(supplied, "uncertainty_material")
      ? supplied.uncertainty_material
      : (registered?.uncertainty_material ?? false),
  };
}

function executeStart(bridge, args, context) {
  const payload = parseRequest(args.request, "assurance start request");
  if (Object.hasOwn(payload, "required_check_ids")) {
    throw new ContractError(
      "QUALITY_FACADE_RUNNER_FIELD",
      "required_check_ids is runner-owned and must not be supplied by the caller",
    );
  }
  if (Object.hasOwn(payload, "dossier")) {
    throw new ContractError(
      "QUALITY_FACADE_REQUEST",
      "nested dossier start is unsupported; use the single runner-seeded provisional start contract",
    );
  }
  let inspection;
  try {
    inspection = inspectRaw(bridge, context);
  } catch (error) {
    const recoverable = error instanceof ContractError
      && ["QUALITY_SESSION_UNCLASSIFIED", "QUALITY_SESSION_PENDING"].includes(error.code)
      && typeof context?.sessionID === "string";
    if (!recoverable) throw error;
    if (error.code === "QUALITY_SESSION_UNCLASSIFIED") {
      handleNormalSessionChatMessage(bridge, context);
      inspection = inspectRaw(bridge, context);
    } else {
      inspection = { lifecycle: "pending" };
    }
  }
  const replayBinding = typeof context?.sessionID === "string"
    ? inspectNormalSessionStartReplayBinding(bridge, context.sessionID)
    : null;
  const requiredCheckIds = replayBinding?.required_check_ids
    ?? inspection.available_check_ids
    ?? inspection.required_check_ids;
  if (requiredCheckIds !== undefined) {
    payload.required_check_ids = [...requiredCheckIds];
  }
  if (payload.risk_class === "standard-lite" && payload.task_type === "bug_fix") {
    payload.reproduction_contract = canonicalStartReproductionContract(
      payload.reproduction_contract,
      replayBinding?.reproducer_check_ids
        ?? inspection.available_reproducer_check_ids
        ?? [],
      replayBinding?.reproduction_contract ?? null,
    );
  }
  executeNormalSessionQualityTool(
    bridge,
    "quality_session_start",
    { request: JSON.stringify(payload) },
    context,
  );
  return facadeInspection(inspectRaw(bridge, context));
}

function executeAdvance(bridge, args, context) {
  const inspection = inspectRaw(bridge, context);
  const selected = selectedTransition(inspection, args.transition, context);
  const payload = bindAdvancePayload(
    parseRequest(args.request, "assurance advance request", { optional: true }),
    inspection,
    selected,
  );
  executeNormalSessionQualityTool(
    bridge,
    selected.spec.toolId,
    { request: JSON.stringify(payload) },
    context,
  );
  return facadeInspection(inspectRaw(bridge, context));
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
  executeNormalSessionQualityTool(
    bridge,
    "quality_action_authorize",
    { request: JSON.stringify(request) },
    context,
  );
  return facadeInspection(inspectRaw(bridge, context));
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

function rewriteAssignmentToolName(value) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("quality_architecture_evaluate", "quality_assurance_advance")
    .replaceAll("quality_verification_record", "quality_assurance_advance")
    .replaceAll("quality_context_reviewer_record", "quality_assurance_advance");
}

export function rewriteRoleAssignmentForFacade(input, output) {
  if (input?.tool !== "task" || typeof output?.args?.prompt !== "string") return;
  const lines = output.args.prompt.split("\n");
  const start = lines.indexOf("[runner quality assignment]");
  const end = lines.indexOf("[end runner quality assignment]");
  if (start === -1 || end <= start) return;
  const envelopeIndex = lines.slice(start + 1, end).findIndex((line) => line.startsWith("{") && line.endsWith("}"));
  if (envelopeIndex === -1) return;
  const absoluteEnvelopeIndex = start + 1 + envelopeIndex;
  let envelope;
  try {
    envelope = JSON.parse(lines[absoluteEnvelopeIndex]);
  } catch {
    throw new ContractError("QUALITY_FACADE_ASSIGNMENT", "runner quality assignment envelope is malformed");
  }
  const legacyToolId = envelope?.assignment?.tool_id;
  const transition = TOOL_TO_TRANSITION[legacyToolId];
  if (transition === undefined) return;
  const legacyRequest = envelope.assignment.request;
  const callerRequest = legacyRequest !== null && typeof legacyRequest === "object" && !Array.isArray(legacyRequest)
    ? visibleRequest(legacyRequest)
    : {};
  envelope.assignment = {
    ...envelope.assignment,
    tool_id: "quality_assurance_advance",
    request: {
      transition,
      request: JSON.stringify(callerRequest),
    },
    instruction: rewriteAssignmentToolName(envelope.assignment.instruction),
  };
  lines[absoluteEnvelopeIndex] = JSON.stringify(envelope);
  for (let index = start + 1; index < end; index += 1) {
    if (index !== absoluteEnvelopeIndex) lines[index] = rewriteAssignmentToolName(lines[index]);
  }
  output.args.prompt = lines.join("\n");
  assertNativeTaskPromptWithinLimit(output.args.prompt);
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
  bridge: suppliedBridge = null,
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
  if (suppliedBridge !== null && (typeof suppliedBridge !== "object" || Array.isArray(suppliedBridge))) {
    throw new ContractError("QUALITY_PLUGIN_API", "supplied assurance bridge must be an object");
  }
  if (suppliedBridge !== null && (Object.keys(bridgeOptions).length > 0
    || hostToolchainAnchorUrl !== undefined || hostToolchainConfigurationLease !== undefined)) {
    throw new ContractError(
      "QUALITY_PLUGIN_API",
      "a supplied assurance bridge cannot be combined with bridge construction options",
    );
  }
  const bridge = suppliedBridge ?? createNormalSessionQualityBridge({
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
