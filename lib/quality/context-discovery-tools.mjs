const NON_LITERAL_DISCOVERY_TOOL_IDS = Object.freeze([
  "context_outline",
  "context_files",
  "context_map",
  "context_symbols",
  "context_related",
]);

export function isNonLiteralDiscoveryTool(toolId) {
  return NON_LITERAL_DISCOVERY_TOOL_IDS.includes(toolId);
}
