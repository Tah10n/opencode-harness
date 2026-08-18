import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  loadProjectCheckCatalog,
} from "../quality/project-check-catalog.mjs";
import {
  loadTrustedToolchainMap,
} from "../quality/trusted-toolchains.mjs";
import {
  TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME,
} from "../quality/trusted-toolchain-host-config.mjs";
import {
  createNormalSessionQualityBridge,
} from "../quality/normal-session-bridge.mjs";
import {
  createNormalSessionQualityPlugin,
  createOpenCodeSessionInfoResolver,
} from "../quality/normal-session-plugin.mjs";
import { createBoundedContextToolSurface } from "./opencode-context-bridge-plugin.mjs";
import { createTrustedProjectCheckBrokerClient } from "./opencode-trusted-check-broker.mjs";

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
  const configDirectory = installedConfigDirectory();
  const modulePath = path.join(
    configDirectory,
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

function installedHostToolchainAnchorUrl() {
  return pathToFileURL(path.join(
    installedConfigDirectory(),
    TRUSTED_TOOLCHAIN_HOST_CONFIG_FILENAME,
  )).href;
}

export function createEngineeringDossierPlugin({ runTrustedTarget = null } = {}) {
  if (runTrustedTarget !== null && typeof runTrustedTarget !== "function") {
    throw new TypeError("runTrustedTarget must be a function when supplied");
  }
  return async ({ client, directory, worktree }) => {
  const workspaceRoot = typeof worktree === "string" && path.parse(worktree).root !== path.resolve(worktree)
    ? worktree : directory;
  const hostToolchainAnchorUrl = installedHostToolchainAnchorUrl();
  const projectCatalog = loadBoundedProjectCheckCatalog(workspaceRoot);
  const toolchainMap = loadBoundedTrustedToolchainMap(workspaceRoot);
  const brokeredTrustedProjectRunner = createTrustedProjectCheckBrokerClient({
    catalogFingerprint: projectCatalog.fingerprint,
    toolchainMapFingerprint: toolchainMap.fingerprint,
  });
  const toolFactory = await installedToolFactory();
  const bridge = createNormalSessionQualityBridge({
    workspaceRoot,
    hostToolchainAnchorUrl,
    projectCatalogLoader: loadBoundedProjectCheckCatalog,
    toolchainMapLoader: loadBoundedTrustedToolchainMap,
    enforceClassifiedContext: true,
    ...((brokeredTrustedProjectRunner ?? runTrustedTarget) === null
      ? {}
      : { runTrustedTarget: brokeredTrustedProjectRunner ?? runTrustedTarget }),
  });
  const plugin = createNormalSessionQualityPlugin({
    toolFactory,
    workspaceRoot,
    bridge,
    sessionInfoResolver: createOpenCodeSessionInfoResolver(client, { directory }),
  });
  const contextTools = createBoundedContextToolSurface({ toolFactory, workspaceRoot });
  return Object.freeze({
    ...plugin,
    tool: Object.freeze({
      ...plugin.tool,
      ...contextTools,
    }),
  });
  };
}

export const EngineeringDossierPlugin = createEngineeringDossierPlugin();
