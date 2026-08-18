import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { createAssuranceFacadePlugin } from "../quality/assurance-facade.mjs";
import { createNormalSessionQualityBridge } from "../quality/normal-session-bridge.mjs";
import { createOpenCodeSessionInfoResolver } from "../quality/normal-session-plugin.mjs";
import { loadProjectCheckCatalog } from "../quality/project-check-catalog.mjs";
import { loadTrustedToolchainMap } from "../quality/trusted-toolchains.mjs";
import { TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME } from "../quality/trusted-toolchain-host-config.mjs";
import { createBoundedContextToolSurface } from "./opencode-context-bridge-plugin.mjs";

const CHECK_CATALOG_PATH = ".git/opencode-harness/quality/checks.json";
const TOOLCHAIN_MAP_PATH = ".git/opencode-harness/quality/toolchains.json";

const loadBoundedProjectCheckCatalog = (workspaceRoot) => loadProjectCheckCatalog(
  workspaceRoot,
  { relativePath: CHECK_CATALOG_PATH },
);

const loadBoundedTrustedToolchainMap = (workspaceRoot) => loadTrustedToolchainMap(
  workspaceRoot,
  { relativePath: TOOLCHAIN_MAP_PATH },
);

function installedConfigDirectory() {
  const configDirectory = process.env.OPENCODE_CONFIG_DIR;
  if (typeof configDirectory !== "string" || !path.isAbsolute(configDirectory)) {
    throw new Error("OpenCode runtime config directory is unavailable");
  }
  return configDirectory;
}

async function installedToolFactory() {
  const modulePath = path.join(
    installedConfigDirectory(),
    "node_modules",
    "@opencode-ai",
    "plugin",
    "dist",
    "index.js",
  );
  const pluginApi = await import(pathToFileURL(modulePath).href);
  if (typeof pluginApi.tool !== "function" || typeof pluginApi.tool.schema?.string !== "function") {
    throw new Error("installed OpenCode plugin API is incompatible");
  }
  return pluginApi.tool;
}

export const AssuranceContextPlugin = async ({ client, directory, worktree }) => {
  const workspaceRoot = typeof worktree === "string" && path.parse(worktree).root !== path.resolve(worktree)
    ? worktree : directory;
  const toolFactory = await installedToolFactory();
  const hostToolchainAnchorUrl = pathToFileURL(path.join(
    installedConfigDirectory(),
    TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME,
  )).href;
  const bridge = createNormalSessionQualityBridge({
    workspaceRoot,
    hostToolchainAnchorUrl,
    projectCatalogLoader: loadBoundedProjectCheckCatalog,
    toolchainMapLoader: loadBoundedTrustedToolchainMap,
    enforceClassifiedContext: true,
  });
  const facade = createAssuranceFacadePlugin({
    toolFactory,
    workspaceRoot,
    bridge,
    sessionInfoResolver: createOpenCodeSessionInfoResolver(client, { directory }),
  });
  return Object.freeze({
    ...facade,
    tool: Object.freeze({
      ...facade.tool,
      ...createBoundedContextToolSurface({ toolFactory, workspaceRoot }),
    }),
  });
};

export default AssuranceContextPlugin;
