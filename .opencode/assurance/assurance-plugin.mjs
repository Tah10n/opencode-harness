import path from "node:path";

import { tool } from "@opencode-ai/plugin";

import { createAssuranceFacadePlugin } from "../lib/quality/assurance-facade.mjs";
import { createOpenCodeSessionInfoResolver } from "../lib/quality/normal-session-plugin.mjs";

function workspaceRoot(directory, worktree) {
  if (typeof worktree !== "string" || path.parse(worktree).root === path.resolve(worktree)) {
    return directory;
  }
  return worktree;
}

export const AssuranceFacadePlugin = async ({ client, directory, worktree }) => createAssuranceFacadePlugin({
  toolFactory: tool,
  workspaceRoot: workspaceRoot(directory, worktree),
  hostToolchainAnchorUrl: import.meta.url,
  sessionInfoResolver: createOpenCodeSessionInfoResolver(client, { directory }),
});
