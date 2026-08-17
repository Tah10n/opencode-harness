import { tool } from "@opencode-ai/plugin";

import {
  createNormalSessionQualityPlugin,
  createOpenCodeSessionInfoResolver,
  legacyQualityPluginEnabled,
} from "opencode-harness/quality-plugin";

export const EngineeringDossierPlugin = async ({ client, directory, worktree }) => {
  const workspaceRoot = worktree ?? directory;
  if (!legacyQualityPluginEnabled(workspaceRoot)) return Object.freeze({});
  return createNormalSessionQualityPlugin({
    toolFactory: tool,
    workspaceRoot,
    sessionInfoResolver: createOpenCodeSessionInfoResolver(client, { directory }),
  });
};
