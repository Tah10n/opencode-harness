import { createHash } from "node:crypto";

const ACTIONS = new Set(["allow", "ask", "deny"]);
const SIMPLE_SEGMENT = /^[A-Za-z0-9*?_-]{1,64}$/;

function normalizeAction(value) {
  if (value === true) return "allow";
  if (value === false) return "deny";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return "allow";
  if (normalized === "false") return "deny";
  return ACTIONS.has(normalized) ? normalized : null;
}

function encodeSegment(value) {
  const segment = String(value);
  if (SIMPLE_SEGMENT.test(segment)) return segment;
  return `h${createHash("sha256").update(segment, "utf8").digest("hex")}`;
}

function safePermissionKey(segments) {
  const encoded = segments.map(encodeSegment).join(".");
  if (encoded.length <= 128) return encoded;
  const root = encodeSegment(segments[0]).slice(0, 48);
  const digest = createHash("sha256").update(JSON.stringify(segments), "utf8").digest("hex");
  return `${root}.h${digest}`.slice(0, 128);
}

function createCollector() {
  // Map preserves every user-controlled key, including "__proto__", without
  // invoking Object.prototype setters or silently dropping evidence.
  const permissions = new Map();
  const errors = [];
  let leafCount = 0;

  function record(segments, rawAction, label) {
    if (leafCount >= 4096) {
      errors.push("permission_surface:too_many_leaves");
      return;
    }
    if (segments.length === 0 || segments.some((segment) => typeof segment !== "string" || segment.length === 0)) {
      errors.push(`${label}:invalid_permission_path`);
      return;
    }
    const action = normalizeAction(rawAction);
    if (action === null) {
      errors.push(`${label}:unknown_action`);
      return;
    }
    permissions.set(safePermissionKey(segments), action);
    leafCount += 1;
  }

  function walk(value, segments, label) {
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) parseEntry(entry, `${label}[${index}]`);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, [...segments, key], `${label}.${key}`);
      return;
    }
    record(segments, value, label);
  }

  function parseEntry(entry, label) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${label}:invalid_entry`);
      return;
    }
    const permission = typeof entry.permission === "string" ? entry.permission : null;
    if (!permission || !Object.hasOwn(entry, "action")) {
      errors.push(`${label}:missing_permission_or_action`);
      return;
    }
    const segments = [permission];
    if (Object.hasOwn(entry, "pattern")) {
      if (typeof entry.pattern !== "string" || entry.pattern.length === 0) {
        errors.push(`${label}:invalid_pattern`);
        return;
      }
      segments.push(entry.pattern);
    }
    record(segments, entry.action, label);
  }

  return { permissions, errors, get leafCount() { return leafCount; }, record, walk, parseEntry };
}

function parseJsonValue(parsed, collector) {
  if (Array.isArray(parsed)) {
    for (const [index, entry] of parsed.entries()) collector.parseEntry(entry, `json[${index}]`);
    return true;
  }
  if (!parsed || typeof parsed !== "object") return false;
  if (typeof parsed.permission === "string" && Object.hasOwn(parsed, "action")) {
    collector.parseEntry(parsed, "json");
    return true;
  }
  if (!Object.hasOwn(parsed, "permission")) return false;
  const container = parsed.permission;
  if (Array.isArray(container)) {
    for (const [index, entry] of container.entries()) collector.parseEntry(entry, `permission[${index}]`);
  } else if (container && typeof container === "object") {
    collector.walk(container, [], "permission");
  } else {
    collector.errors.push("permission:invalid_container");
  }
  return true;
}

function parseJson(output, collector) {
  try {
    return parseJsonValue(JSON.parse(output), collector);
  } catch {
    return false;
  }
}

function parseJsonEntryStream(output, collector) {
  const meaningful = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (meaningful.length === 0) return false;
  const parsed = [];
  for (const [index, line] of meaningful.entries()) {
    try {
      parsed.push(JSON.parse(line));
    } catch {
      return false;
    }
    if (!parsed.at(-1) || typeof parsed.at(-1) !== "object" || Array.isArray(parsed.at(-1))) return false;
    if (typeof parsed.at(-1).permission !== "string" || !Object.hasOwn(parsed.at(-1), "action")) {
      collector.errors.push(`stream[${index}]:missing_permission_or_action`);
      continue;
    }
    collector.parseEntry(parsed.at(-1), `stream[${index}]`);
  }
  return true;
}

function stripYamlComment(value) {
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if ((character === '"' || character === "'") && (index === 0 || value[index - 1] !== "\\")) {
      quote = quote === character ? null : quote === null ? character : quote;
    } else if (character === "#" && quote === null) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value.trimEnd();
}

function splitYamlPair(rawLine) {
  const indent = rawLine.match(/^\s*/)[0].length;
  const content = stripYamlComment(rawLine.slice(indent));
  let quote = null;
  let colon = -1;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if ((character === '"' || character === "'") && (index === 0 || content[index - 1] !== "\\")) {
      quote = quote === character ? null : quote === null ? character : quote;
    } else if (character === ":" && quote === null) {
      colon = index;
      break;
    }
  }
  if (colon < 1 || quote !== null) return null;
  const unquote = (value) => {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  };
  const key = unquote(content.slice(0, colon));
  const value = unquote(content.slice(colon + 1));
  if (!key) return null;
  return { indent, key, value };
}

function parseYamlLike(output, collector) {
  const lines = output.split(/\r?\n/);
  let foundContainer = false;
  for (let index = 0; index < lines.length; index += 1) {
    const pair = splitYamlPair(lines[index]);
    if (!pair || pair.key !== "permission" || pair.value !== "") continue;
    foundContainer = true;
    const containerIndent = pair.indent;
    const stack = [];
    let foundChild = false;
    for (index += 1; index < lines.length; index += 1) {
      const raw = lines[index];
      if (!raw.trim() || raw.trimStart().startsWith("#")) continue;
      const child = splitYamlPair(raw);
      const indent = raw.match(/^\s*/)[0].length;
      if (indent <= containerIndent) {
        index -= 1;
        break;
      }
      foundChild = true;
      if (!child) {
        collector.errors.push(`yaml:${index + 1}:malformed_entry`);
        continue;
      }
      while (stack.length > 0 && child.indent <= stack.at(-1).indent) stack.pop();
      const segments = [...stack.map((entry) => entry.key), child.key];
      if (child.value === "") stack.push({ indent: child.indent, key: child.key });
      else collector.record(segments, child.value, `yaml:${index + 1}`);
    }
    if (!foundChild) collector.errors.push("permission:empty_container");
  }
  return foundContainer;
}

export function extractPermissionSurface(output) {
  const collector = createCollector();
  const source = typeof output === "string" ? output.trim() : "";
  let format = null;
  if (source.length > 2 * 1024 * 1024) {
    collector.errors.push("permission_surface:output_too_large");
  } else if (source) {
    if (parseJson(source, collector)) format = "json";
    else if (parseJsonEntryStream(source, collector)) format = "json_stream";
    else if (parseYamlLike(source, collector)) format = "yaml_like";
  }
  if (!format) collector.errors.push("unrecognized_permission_format");
  if (collector.leafCount === 0) collector.errors.push("no_permission_leaves");
  return {
    permissions: Object.fromEntries([...collector.permissions.entries()].sort(([left], [right]) => left.localeCompare(right))),
    complete: collector.errors.length === 0,
    errors: [...new Set(collector.errors)].sort(),
    format,
  };
}

export function collectResolvedPermissionSurface({ configOutput, agentOutputs, agentNames }) {
  const permissions = new Map();
  const incompleteScopes = [];
  const scopes = [["config", configOutput], ...agentNames.map((agent) => [`agent.${agent}`, agentOutputs.get(agent) ?? ""])];
  for (const [scope, output] of scopes) {
    const extracted = extractPermissionSurface(output);
    if (!extracted.complete) incompleteScopes.push(scope);
    for (const [key, action] of Object.entries(extracted.permissions)) permissions.set(`${scope}.${key}`, action);
  }
  return {
    permissions: Object.fromEntries([...permissions.entries()].sort(([left], [right]) => left.localeCompare(right))),
    complete: incompleteScopes.length === 0,
    incomplete_scopes: incompleteScopes,
  };
}
