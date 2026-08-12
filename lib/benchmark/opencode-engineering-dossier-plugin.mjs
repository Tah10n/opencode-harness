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
  createNormalSessionQualityPlugin,
  createOpenCodeSessionInfoResolver,
} from "../quality/normal-session-plugin.mjs";
import { ContextBridgePlugin } from "./opencode-context-bridge-plugin.mjs";
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

export const EngineeringDossierPlugin = async ({ client, directory, worktree }) => {
  const workspaceRoot = worktree ?? directory;
  const hostToolchainAnchorUrl = installedHostToolchainAnchorUrl();
  const contextPlugin = await ContextBridgePlugin({
    directory,
    worktree,
    hostToolchainAnchorUrl,
  });
  const projectCatalog = loadBoundedProjectCheckCatalog(workspaceRoot);
  const toolchainMap = loadBoundedTrustedToolchainMap(workspaceRoot);
  const brokeredTrustedProjectRunner = createTrustedProjectCheckBrokerClient({
    catalogFingerprint: projectCatalog.fingerprint,
    toolchainMapFingerprint: toolchainMap.fingerprint,
  });
  const plugin = createNormalSessionQualityPlugin({
    toolFactory: await installedToolFactory(),
    workspaceRoot,
    hostToolchainAnchorUrl,
    sessionInfoResolver: createOpenCodeSessionInfoResolver(client, { directory }),
    bridgeOptions: {
      projectCatalogLoader: loadBoundedProjectCheckCatalog,
      toolchainMapLoader: loadBoundedTrustedToolchainMap,
      ...(brokeredTrustedProjectRunner === null
        ? {}
        : { runTrustedTarget: brokeredTrustedProjectRunner }),
    },
  });
  const contextBridgeTools = new Set(["context_outline", "context_read"]);
  const isContextBridgeCall = (input) => contextBridgeTools.has(input?.tool);
  const isFailedContextBridgeEvent = (input) => {
    const event = input?.event;
    const part = event?.type === "message.part.updated" ? event.properties?.part : null;
    return part?.type === "tool" && contextBridgeTools.has(part.tool) && part.state?.status === "error";
  };
  return Object.freeze({
    ...plugin,
    tool: Object.freeze({
      ...plugin.tool,
      ...contextPlugin.tool,
    }),
    async "tool.execute.before"(input, output) {
      if (isContextBridgeCall(input)) return;
      return plugin["tool.execute.before"](input, output);
    },
    async "tool.execute.after"(input, output) {
      if (isContextBridgeCall(input)) return;
      return plugin["tool.execute.after"](input, output);
    },
    async event(input) {
      if (isFailedContextBridgeEvent(input)) return;
      return plugin.event(input);
    },
  });
};
