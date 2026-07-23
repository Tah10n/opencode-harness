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

const TOOL_DESCRIPTIONS = Object.freeze({
  quality_session_start: "Classify this registered development session and bind its ownership and trusted project checks.",
  quality_dossier_create: "Create the runner-bound provisional Engineering Dossier draft and provisional impact graph before instrumented context discovery.",
  quality_dossier_update: "Refine the provisional Dossier and impact graph from current evidence using an exact expected revision.",
  quality_dossier_inspect: "Inspect the bounded dossier, gate, ownership, and verification status.",
  quality_context_strategy_escalate: "Request a runner-owned monotonic context-strategy escalation before context evidence is collected.",
  quality_context_report_create: "Inspect the runner-created Whole-System Context Report draft before discovery.",
  quality_context_report_update: "Update the analytical content of the current Whole-System Context Report draft.",
  quality_context_report_finalize: "Finalize the report and compute the runner-owned context sufficiency decision.",
  quality_architecture_evaluate: "Record a post-sufficiency architect or reviewer contribution bound to the canonical current challenge subject: current Dossier analysis, selected strategy, finalized context report analysis, runner-owned sufficient context decision, and task-profile evidence; identity comes from the host.",
  quality_dossier_finalize: "Finalize the current Dossier and request baseline checks plus existing gate evaluation; finalization alone does not authorize mutation.",
  quality_action_authorize: "Request a one-shot mutation or writable-delegation capability after a passed gate.",
  quality_command_authorize: "Fail-closed compatibility sentinel: native Bash authorization is disabled; use catalog-backed trusted project checks.",
  quality_verification_record: "Ask the trusted runner to execute every canonical verification target.",
  quality_context_reviewer_record: "Record reviewer-only final blast-radius evidence without claiming graph completeness.",
  quality_context_reconcile: "Compute the runner-owned final blast-radius reconciliation for attestation.",
  quality_session_finalize: "Request a runner-owned final attestation for the current verified workspace.",
});

export function createNormalSessionQualityToolSurface({ toolFactory, bridge }) {
  if (!toolFactory || typeof toolFactory !== "function" || !toolFactory.schema?.string) {
    throw new ContractError("QUALITY_PLUGIN_API", "installed @opencode-ai/plugin tool factory is unavailable or incompatible");
  }
  return Object.fromEntries(NORMAL_SESSION_QUALITY_TOOL_IDS.map((toolId) => [toolId, toolFactory({
    description: TOOL_DESCRIPTIONS[toolId],
    args: {
      request: toolFactory.schema.string().describe("Strict JSON request envelope. Unknown JSON fields are rejected by the quality core."),
    },
    async execute(args, context) {
      const receipt = executeNormalSessionQualityTool(bridge, toolId, args, context);
      return `${JSON.stringify(receipt)}\n`;
    },
  })]));
}

export function createNormalSessionQualityPlugin({
  toolFactory,
  workspaceRoot,
  bridgeOptions = {},
  hostToolchainAnchorUrl = undefined,
  hostToolchainConfigurationLease = undefined,
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
  const bridge = createNormalSessionQualityBridge({
    ...bridgeOptions,
    workspaceRoot,
    ...(hostToolchainAnchorUrl === undefined ? {} : { hostToolchainAnchorUrl }),
    ...(hostToolchainConfigurationLease === undefined ? {} : { hostToolchainConfigurationLease }),
  });
  return Object.freeze({
    tool: createNormalSessionQualityToolSurface({ toolFactory, bridge }),
    async "chat.message"(input) {
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
    },
    async event(input) {
      handleNormalSessionEvent(bridge, input?.event);
    },
  });
}
