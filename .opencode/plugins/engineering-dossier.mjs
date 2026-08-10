import { tool } from "@opencode-ai/plugin";

import {
  createNormalSessionQualityPlugin,
  createOpenCodeSessionInfoResolver,
} from "opencode-harness/quality-plugin";

export const EngineeringDossierPlugin = async ({ client, directory, worktree }) => createNormalSessionQualityPlugin({
  toolFactory: tool,
  workspaceRoot: worktree ?? directory,
  sessionInfoResolver: createOpenCodeSessionInfoResolver(client, { directory }),
});
