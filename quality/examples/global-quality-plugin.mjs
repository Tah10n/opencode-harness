import { tool } from "@opencode-ai/plugin";
import { createNormalSessionQualityPlugin } from "opencode-harness/quality-plugin";

export const EngineeringDossierPlugin = async ({ directory, worktree }) => createNormalSessionQualityPlugin({
  toolFactory: tool,
  workspaceRoot: worktree ?? directory,
  hostToolchainAnchorUrl: import.meta.url,
});
