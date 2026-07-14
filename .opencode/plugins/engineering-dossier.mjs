import { tool } from "@opencode-ai/plugin";

import { createNormalSessionQualityPlugin } from "../../lib/quality/normal-session-plugin.mjs";

export const EngineeringDossierPlugin = async ({ directory, worktree }) => createNormalSessionQualityPlugin({
  toolFactory: tool,
  workspaceRoot: worktree ?? directory,
});
