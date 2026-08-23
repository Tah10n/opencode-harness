const MUTATION_TOOLS = new Set(["edit", "write", "patch", "apply_patch", "multiedit"]);
const SHELL_TOOLS = new Set(["bash", "shell", "terminal", "powershell", "command"]);
const PATH_LIKE_INPUT_KEY = /(?:^|_)(?:path|file|filepath|file_path|directory|dir|cwd|target|source)(?:$|_)/iu;
const PATH_TOKEN = /(?<![A-Za-z0-9._-])(?:(?:[A-Za-z]:[\\/]|\/)?(?:(?:\.{1,2}|[A-Za-z0-9_-][A-Za-z0-9._-]*)[\\/])*(?:\.env(?:\.[A-Za-z0-9._-]+)?|credentials?(?:\.[A-Za-z0-9._-]+)?|secrets?(?:\.[A-Za-z0-9._-]+)?|[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:pem|key|p12|pfx)))(?![A-Za-z0-9._\\/-])/giu;
const PATCH_PATH = /^\*\*\* (?:(?:Add|Update|Delete) File|Move to):\s*(.+?)\s*$/gmu;
const SECRET_LIKE_PATH = /(?:^|\/)(?:\.env(?:\.[^/]*)?|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|[^/]+\.(?:pem|key|p12|pfx))$/iu;
const MAX_VISITED_VALUES = 512;
const MAX_STRING_CHARS = 128 * 1024;

export const SECRET_MUTATION_DENIAL_CODE = "CONTRACT_SECRET_MUTATION_DENIED";

export function isSecretLikeMutationPath(value) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_STRING_CHARS
    && SECRET_LIKE_PATH.test(value.replaceAll("\\", "/"));
}

function addCandidate(output, value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_STRING_CHARS) return;
  output.add(value.trim().replace(/^['"]|['"]$/gu, ""));
}

function structuredPathCandidates(value) {
  const candidates = new Set();
  const pending = [{ key: "", value }];
  let visited = 0;
  let complete = true;
  while (pending.length > 0 && visited < MAX_VISITED_VALUES) {
    const current = pending.pop();
    visited += 1;
    if (typeof current.value === "string") {
      if (PATH_LIKE_INPUT_KEY.test(current.key)) {
        if (current.value.length > MAX_STRING_CHARS) complete = false;
        else addCandidate(candidates, current.value);
      }
      if (/^(?:patch|patch_text|patchText)$/u.test(current.key)) {
        if (current.value.length > MAX_STRING_CHARS) complete = false;
        else for (const match of current.value.matchAll(PATCH_PATH)) addCandidate(candidates, match[1]);
      }
      continue;
    }
    if (current.value === null || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      for (const entry of current.value) pending.push({ key: current.key, value: entry });
      continue;
    }
    for (const [key, entry] of Object.entries(current.value)) pending.push({ key, value: entry });
  }
  if (pending.length > 0) complete = false;
  return { candidates, complete };
}

function shellPathCandidates(command) {
  const candidates = new Set();
  if (typeof command !== "string" || command.length === 0 || command.length > MAX_STRING_CHARS) return candidates;
  for (const match of command.matchAll(PATH_TOKEN)) addCandidate(candidates, match[0]);
  return candidates;
}

export function secretMutationIntent(tool, args) {
  const normalizedTool = typeof tool === "string" ? tool.toLowerCase() : "";
  if (MUTATION_TOOLS.has(normalizedTool)) {
    const structured = structuredPathCandidates(args);
    return structured.complete === false
      || [...structured.candidates].some(isSecretLikeMutationPath);
  }
  if (!SHELL_TOOLS.has(normalizedTool)) return false;
  const command = typeof args?.command === "string" ? args.command
    : typeof args?.cmd === "string" ? args.cmd : "";
  if (command.length > MAX_STRING_CHARS) return true;
  return [...shellPathCandidates(command)].some(isSecretLikeMutationPath);
}
