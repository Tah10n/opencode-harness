import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

function fail() { process.exit(64); }
const [inputFile, outputFile, marker] = process.argv.slice(2);
if (![inputFile, outputFile, marker].every((entry) => typeof entry === "string" && entry.length > 0)) fail();
let input;
try { input = JSON.parse(fs.readFileSync(inputFile, "utf8")); } catch { fail(); }
if (input?.schema_version !== 1 || typeof input.file !== "string" || !Array.isArray(input.args)
  || typeof input.cwd !== "string" || typeof input.timeout_ms !== "number" || typeof input.env_overrides !== "object"
  || typeof input.opencode_identity !== "object"
  || !(input.activation_binding === null || typeof input.activation_binding === "object")) fail();
const identity = input.opencode_identity;
try {
  const stat = fs.lstatSync(identity.path);
  const current = { schema_version: 1, path: fs.realpathSync.native(identity.path), size: stat.size, mode: stat.mode & 0o7777,
    device: String(stat.dev), inode: String(stat.ino), sha256: `sha256:${createHash("sha256").update(fs.readFileSync(identity.path)).digest("hex")}`,
    version: identity.version, variant_supported: identity.variant_supported, seed_supported: identity.seed_supported };
  const version = spawnSync(identity.path, ["--version"], { env: process.env, encoding: "utf8", shell: false, windowsHide: true,
    timeout: 30_000, maxBuffer: 64 * 1024 });
  const same = stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && (stat.mode & 0o111) !== 0
    && version.status === 0 && version.stdout.trim() === identity.version
    && Object.keys(current).every((key) => current[key] === identity[key]);
  if (!same) fail();
} catch { fail(); }
const result = spawnSync(input.file, input.args, { cwd: input.cwd, env: { ...process.env, ...input.env_overrides }, encoding: "utf8", shell: false,
  windowsHide: true, timeout: input.timeout_ms, maxBuffer: 32 * 1024 * 1024,
  stdio: input.activation_binding === null ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe", "pipe"] });
let tokens = 0;
let jsonEventCount = 0;
let terminalEventCount = 0;
let finalTextEligible = false;
let openStepCount = 0;
const toolStates = new Map();
let usageObserved = false;
let protocolValid = true;
const knownEventTypes = new Set(["step_start", "step_finish", "tool_use", "text", "reasoning", "error"]);
for (const line of String(result.stdout ?? "").split("\n")) {
  if (line.trim().length === 0) continue;
  try {
    const value = JSON.parse(line);
    if (!value || typeof value !== "object" || typeof value.type !== "string" || !knownEventTypes.has(value.type)) {
      protocolValid = false;
      continue;
    }
    jsonEventCount += 1;
    if (value.type === "error") protocolValid = false;
    if (value.type === "step_start") openStepCount += 1;
    if (value.type === "step_finish" && openStepCount > 0) openStepCount -= 1;
    if (value.type === "tool_use") {
      const id = value.part?.id;
      const status = value.part?.state?.status;
      if (typeof id !== "string" || id.length === 0 || typeof status !== "string") protocolValid = false;
      else {
        const previous = toolStates.get(id);
        if (["completed", "error", "failed"].includes(previous)) protocolValid = false;
        else toolStates.set(id, status.toLowerCase());
      }
    }
    if (["step_start", "tool_use", "reasoning", "error"].includes(value.type)) finalTextEligible = false;
    if (value.type === "text") {
      if (typeof value.part?.text !== "string") protocolValid = false;
      else if (value.part.text.trim().length > 0) finalTextEligible = true;
    }
    const usage = value?.usage ?? value?.part?.usage ?? value?.data?.usage;
    const count = usage?.total_tokens ?? usage?.totalTokens;
    if (Number.isSafeInteger(count) && count >= 0) { tokens += count; usageObserved = true; }
  } catch { protocolValid = false; }
}
terminalEventCount = finalTextEligible ? 1 : 0;
const unfinishedToolCount = [...toolStates.values()].filter((status) => !["completed", "error", "failed"].includes(status)).length;
protocolValid &&= terminalEventCount >= 1 && usageObserved && openStepCount === 0 && unfinishedToolCount === 0;
let activation = false;
let activationReceiptValid = input.activation_binding === null;
if (input.activation_binding !== null) {
  try {
    const bytes = String(result.output?.[3] ?? "");
    const value = JSON.parse(bytes);
    const exact = (object, keys) => object && typeof object === "object" && !Array.isArray(object)
      && JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort());
    activationReceiptValid = bytes.endsWith("\n") && bytes.indexOf("\n") === bytes.length - 1
      && exact(value, ["schema_version", "catalog_fingerprint", "catalog_status", "decision", "activation", "check"])
      && value.schema_version === 1 && value.catalog_fingerprint === input.activation_binding.catalog_fingerprint
      && value.catalog_status === "loaded" && value.decision?.allowed === true
      && value.decision?.reason === "post_last_mutation_verification_passed"
      && value.activation?.post_last_mutation_verification === true
      && value.check?.status === "passed" && value.check?.command_fingerprint === input.activation_binding.command_fingerprint;
    activation = activationReceiptValid;
  } catch { activationReceiptValid = false; }
}
const receipt = { schema_version: 1, status: Number.isInteger(result.status) ? result.status : null, signal: result.signal ?? null,
  timed_out: result.error?.code === "ETIMEDOUT", error_code: typeof result.error?.code === "string" ? result.error.code : null,
  tokens, activation, json_event_count: jsonEventCount, terminal_event_count: terminalEventCount,
  usage_observed: usageObserved, protocol_valid: protocolValid, open_step_count: openStepCount,
  unfinished_tool_count: unfinishedToolCount, activation_receipt_valid: activationReceiptValid,
  stdout_bytes: Buffer.byteLength(String(result.stdout ?? "")), stderr_bytes: Buffer.byteLength(String(result.stderr ?? "")) };
fs.writeFileSync(outputFile, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write(marker);
