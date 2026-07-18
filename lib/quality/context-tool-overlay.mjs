import {
  ADVANCED_CONTEXT_TOOL_IDS,
  MINIMAL_CONTEXT_TOOL_IDS,
} from "./context-tool-adapters.mjs";
import { deepFrozenClone } from "./validation.mjs";

export function detectInstalledContextToolSurface(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.tool_ids)) {
    return deepFrozenClone({
      host_schema: "unsupported_host_schema",
      minimal_tools: "unknown",
      advanced_tools: "unknown",
      available_tool_ids: [],
    }, "installed context tool surface");
  }
  const toolIds = new Set(value.tool_ids.filter((entry) => typeof entry === "string"));
  const availableToolIds = [...new Set([...MINIMAL_CONTEXT_TOOL_IDS, ...ADVANCED_CONTEXT_TOOL_IDS]
    .filter((entry) => toolIds.has(entry)))].sort();
  return deepFrozenClone({
    host_schema: "supported",
    minimal_tools: MINIMAL_CONTEXT_TOOL_IDS.every((entry) => toolIds.has(entry)) ? "minimal_available" : "minimal_unavailable",
    advanced_tools: ADVANCED_CONTEXT_TOOL_IDS.every((entry) => toolIds.has(entry)) ? "advanced_available" : "advanced_unavailable",
    available_tool_ids: availableToolIds,
  }, "installed context tool surface");
}
