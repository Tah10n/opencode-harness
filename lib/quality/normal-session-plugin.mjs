import {
  NORMAL_SESSION_QUALITY_TOOL_IDS,
  createNormalSessionQualityBridge,
  executeNormalSessionQualityTool,
  handleNormalSessionEvent,
  handleNormalSessionPermission,
  handleNormalSessionToolAfter,
  handleNormalSessionToolBefore,
} from "./normal-session-bridge.mjs";
import { ContractError } from "./validation.mjs";

const TOOL_DESCRIPTIONS = Object.freeze({
  quality_dossier_create: "Create a runner-bound Engineering Dossier draft for this OpenCode session.",
  quality_dossier_update: "Update agent-owned dossier content using an exact expected revision.",
  quality_dossier_inspect: "Inspect the bounded dossier, gate, ownership, and verification status.",
  quality_architecture_evaluate: "Record an architect or reviewer challenge contribution; identity comes from the host.",
  quality_dossier_finalize: "Request runner-owned dossier finalization, baseline checks, and gate evaluation.",
  quality_action_authorize: "Request a one-shot mutation or writable-delegation capability after a passed gate.",
  quality_verification_record: "Ask the trusted runner to execute every canonical verification target.",
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

export function createNormalSessionQualityPlugin({ toolFactory, workspaceRoot, bridgeOptions = {} }) {
  const bridge = createNormalSessionQualityBridge({ workspaceRoot, ...bridgeOptions });
  return Object.freeze({
    tool: createNormalSessionQualityToolSurface({ toolFactory, bridge }),
    async "permission.ask"(input, output) {
      handleNormalSessionPermission(bridge, input, output);
    },
    async "tool.execute.before"(input, output) {
      handleNormalSessionToolBefore(bridge, input, output);
    },
    async "tool.execute.after"(input) {
      handleNormalSessionToolAfter(bridge, input);
    },
    async event(input) {
      handleNormalSessionEvent(bridge, input?.event);
    },
  });
}
