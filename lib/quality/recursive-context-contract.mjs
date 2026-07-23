export const RECURSIVE_CONTEXT_OUTPUT_SCHEMA_VERSION = 2;
export const RECURSIVE_CONTEXT_PRODUCER = "opencode-recursive-context";
export const SUPPORTED_RECURSIVE_CONTEXT_CONTRACT_VERSIONS = Object.freeze(["2.0"]);
export const SUPPORTED_RECURSIVE_CONTEXT_POLICY_VERSIONS = Object.freeze([1]);

export const MINIMAL_RECURSIVE_CONTEXT_TOOL_IDS = Object.freeze([
  "context_outline",
  "context_files",
  "context_search",
  "context_read",
]);

export const ADVANCED_RECURSIVE_CONTEXT_TOOL_IDS = Object.freeze([
  "context_map",
  "context_batch_read",
  "context_symbols",
  "context_related",
]);

export const RECURSIVE_CONTEXT_TOOL_IDS = Object.freeze([
  ...MINIMAL_RECURSIVE_CONTEXT_TOOL_IDS,
  ...ADVANCED_RECURSIVE_CONTEXT_TOOL_IDS,
]);

export const RECURSIVE_CONTEXT_COVERAGE_TRUNCATION_KEYS = Object.freeze([
  "inventoryLimitReached",
  "resultLimitReached",
  "matchLimitReached",
  "byteLimitReached",
  "lineLimitReached",
  "durationLimitReached",
  "symbolLimitReached",
  "relationshipLimitReached",
  "snapshotChanged",
  "coveragePartial",
]);

export const RECURSIVE_CONTEXT_INFORMATIONAL_TRUNCATION_KEYS = Object.freeze([
  "excerptTruncated",
  "contextBeforeTruncated",
  "contextAfterTruncated",
]);

export const CONTEXT_INFORMATIONAL_RECEIPT_TRUNCATION_CODES = Object.freeze([
  "excerpt_truncated",
  "context_before_truncated",
  "context_after_truncated",
  "range_truncated_before",
  "range_truncated_after",
]);
