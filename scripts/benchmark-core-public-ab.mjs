#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { canonicalJson, fingerprint } from "../lib/feedback/contracts.mjs";
import {
  discoverBenchmarkV3SemanticRuntimeKeys,
  fingerprintBenchmarkV3SemanticRuntime,
  loadBenchmarkV3Corpus,
} from "../lib/benchmark/v3-corpus.mjs";
import { exactBinomialUpperTail } from "../lib/benchmark/v3-design.mjs";
import { exactTwoSidedMcNemar } from "../lib/benchmark/statistics.mjs";
import {
  createBenchmarkV3OAuthCredentialBroker,
  createBenchmarkV3ProviderCredentialStore,
  preflightBenchmarkV3ProviderCredentialStore,
  verifyBenchmarkV3OpenCodeExecutable,
  verifyBenchmarkV3ProductBundle,
} from "../lib/benchmark/v3-runner.mjs";
import { initializeBenchmarkV3OpenAIOAuthState } from "../lib/benchmark/v3-provider-auth-state.mjs";

const RUNNER_PATH = fileURLToPath(import.meta.url);
const SOURCE_ROOT = path.resolve(path.dirname(RUNNER_PATH), "..");
const STRATA = Object.freeze(["small", "medium", "high"]);
const DATASETS = Object.freeze(["validation", "pilot"]);
const ARMS = Object.freeze(["plain", "core"]);
const PRODUCT_SOURCE_SHA = "89f1f7f1980a829d7da162fcd737d0c52613225d";
const CORE_BUNDLE_FINGERPRINT = "sha256:688ddc642bf694d7ab110915d5a101722b13ba6eeebde1b0788814575e3e8d21";
const MODEL_BINDING = Object.freeze({ provider: "openai", model: "gpt-5.6-luna", variant: "low" });
const DEFAULT_TIMEOUT_MS = 900_000;
const BOOTSTRAP_RESAMPLES = 100_000;
const SCHEDULE_SEED = "core-public-ab-counterbalanced-v1";
const ACCEPTANCE_PROMPT = "Return exactly acceptance-probe-complete. Do not edit files and do not use tools.";
const ACCEPTANCE_TEXT = "acceptance-probe-complete";
const PILOT_REPOSITORY_COUNTS = Object.freeze({ eslint: 8, express: 1, axios: 12, fastify: 8 });
const MEASUREMENT_CONTRACT_PATH = path.join(SOURCE_ROOT,
  "research", "measurements", "core-public-ab-v1", "measurement-contract.v1.json");
const PRIMARY_SCORED_CALLS = 120;
const PILOT_SCORED_CALLS = 58;
const TOTAL_SCORED_CALLS = PRIMARY_SCORED_CALLS + PILOT_SCORED_CALLS;
const MAXIMUM_INFRASTRUCTURE_RETRIES = 18;
const MAXIMUM_MODEL_CALLS = TOTAL_SCORED_CALLS + MAXIMUM_INFRASTRUCTURE_RETRIES;
const OVERLAY = Object.freeze({
  permission: Object.freeze({
    bash: "deny",
    webfetch: "deny",
    websearch: "deny",
    task: "deny",
    external_directory: "deny",
  }),
  agent: Object.freeze({
    core: Object.freeze({ permission: Object.freeze({ edit: "allow", bash: "deny", webfetch: "deny", websearch: "deny", task: "deny", external_directory: "deny", question: "deny" }) }),
    build: Object.freeze({ permission: Object.freeze({ edit: "allow", bash: "deny", webfetch: "deny", websearch: "deny", task: "deny", external_directory: "deny", question: "deny" }) }),
  }),
});
const PILOT_ADAPTERS = Object.freeze({
  eslint: Object.freeze({ kind: "mocha", entry: "node_modules/mocha/bin/mocha.js", prefix_args: [] }),
  express: Object.freeze({ kind: "mocha", entry: "node_modules/mocha/bin/mocha.js", prefix_args: ["--require", "test/support/env"] }),
  axios: Object.freeze({ kind: "vitest", entry: "node_modules/vitest/vitest.mjs", prefix_args: ["run", "--project", "unit", "--no-cache"] }),
  fastify: Object.freeze({ kind: "node-test", entry: null, prefix_args: ["--test"] }),
});
const FP = /^sha256:[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const BENCHMARK_INPUT_PATHS = Object.freeze([
  "lib/feedback/contracts.mjs",
  "lib/benchmark/v3-corpus.mjs",
  "lib/benchmark/v3-design.mjs",
  "lib/benchmark/v3-provider-auth-state.mjs",
  "lib/benchmark/v3-runner.mjs",
  "lib/benchmark/statistics.mjs",
]);
const MEASUREMENT_SOURCE_ALLOWED_PATHS = Object.freeze([
  ".github/workflows/verify.yml",
  "package.json",
  "scripts/benchmark-core-public-ab.mjs",
  "research/measurements/core-public-ab-v1/measurement-contract.v1.json",
  "research/measurements/core-public-ab-v1/measurement-manifest.json",
]);
const MEASUREMENT_SOURCE_ALLOWED_PREFIXES = Object.freeze([
  "benchmarks/results/core-public-ab-measurement-v1/",
  "docs/research/core-public-ab-measurement-v1/",
  "research/measurements/core-public-ab-v1/",
]);
const PROVIDER_RESPONSE_LIMIT = 64 * 1024 * 1024;

const PROVIDER_PROXY_PLUGIN = String.raw`import fs from "node:fs";
import path from "node:path";
import { request as httpRequest } from "node:http";

const ENV = "CORE_PUBLIC_AB_PROVIDER_PROXY_FILE";
const PLACEHOLDER = "core-public-ab-host-provider-proxy";

function exact(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function consume() {
  const target = process.env[ENV]; delete process.env[ENV];
  if (typeof target !== "string" || !path.isAbsolute(target)) throw new Error("provider proxy file is unavailable");
  const fd = fs.openSync(target, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW ?? 0)); let bytes;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.size < 2 || stat.size > 64 * 1024) {
      throw new Error("provider proxy file is not a private bounded ordinary file");
    }
    bytes = fs.readFileSync(fd); fs.writeSync(fd, Buffer.alloc(bytes.length), 0, bytes.length, 0); fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.unlinkSync(target);
  const parent = fs.openSync(path.dirname(target), fs.constants.O_RDONLY);
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  let value; try { value = JSON.parse(bytes.toString("utf8")); } finally { bytes.fill(0); }
  if (!exact(value, ["schema_version", "provider", "proxy_socket", "proxy_capability"])
    || value.schema_version !== 1 || value.provider !== "openai"
    || typeof value.proxy_capability !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value.proxy_capability)) {
    throw new Error("provider proxy binding is invalid");
  }
  if (typeof value.proxy_socket !== "string" || !/^\/private\/tmp\/core-ab-[A-Za-z0-9_-]{12,80}\.sock$/u.test(value.proxy_socket)) {
    throw new Error("provider proxy socket escaped frozen short-path custody");
  }
  const socketStat = fs.lstatSync(value.proxy_socket);
  if (!socketStat.isSocket() || (socketStat.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && socketStat.uid !== process.getuid())) {
    throw new Error("provider proxy socket identity is untrusted");
  }
  return Object.freeze({ socket: value.proxy_socket, capability: value.proxy_capability });
}
function approved(input) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://api.openai.com" || !["/v1/responses", "/v1/chat/completions"].includes(url.pathname)
    || url.username || url.password || url.search || url.hash) throw new Error("provider request escaped approved OpenAI paths");
  return url.toString();
}
async function bodyBytes(input, init) {
  if (init?.body !== undefined && init.body !== null) {
    if (typeof init.body === "string" || init.body instanceof Uint8Array) return Buffer.from(init.body);
    return Buffer.from(await new Response(init.body).arrayBuffer());
  }
  return input instanceof Request ? Buffer.from(await input.clone().arrayBuffer()) : Buffer.alloc(0);
}
function proxyRequest(binding, payload) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ socketPath: binding.socket, path: "/proxy", method: "POST",
      headers: { authorization: "Bearer " + binding.capability, "content-type": "application/json",
        "content-length": Buffer.byteLength(payload) } }, (response) => {
      const chunks = []; let size = 0;
      response.on("data", (chunk) => { size += chunk.length; if (size <= 96 * 1024 * 1024) chunks.push(chunk); else response.destroy(); });
      response.on("end", () => resolve({ status: response.statusCode, bytes: Buffer.concat(chunks) }));
    });
    request.once("error", reject); request.end(payload);
  });
}
export const CorePublicAbProviderProxyPlugin = async () => {
  let binding = consume();
  return { auth: { provider: "openai", methods: [], loader: async (readAuth) => {
    const auth = await readAuth();
    if (auth?.type !== "api" || auth.key !== PLACEHOLDER || binding === null) throw new Error("provider proxy authorization is invalid");
    return { apiKey: "core-public-ab-provider-proxy-dummy", fetch: async (input, init = {}) => {
      if (binding === null) throw new Error("provider proxy is disposed");
      const url = approved(input); const body = await bodyBytes(input, init);
      if (body.length > 32 * 1024 * 1024) throw new Error("provider request body is too large");
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      headers.delete("authorization"); headers.delete("cookie"); headers.delete("host");
      const response = await proxyRequest(binding, JSON.stringify({ schema_version: 1,
        method: init.method ?? (input instanceof Request ? input.method : "POST"),
        url, headers: [...headers.entries()], body_base64: body.toString("base64") }));
      if (response.status !== 200) throw new Error("host provider proxy failed with status " + response.status);
      const value = JSON.parse(response.bytes.toString("utf8")); response.bytes.fill(0);
      if (!exact(value, ["schema_version", "status", "headers", "body_base64"]) || value.schema_version !== 1
        || !Number.isSafeInteger(value.status) || !Array.isArray(value.headers) || typeof value.body_base64 !== "string") {
        throw new Error("host provider proxy response is invalid");
      }
      return new Response(Buffer.from(value.body_base64, "base64"), { status: value.status, headers: value.headers });
    } };
  } }, "shell.env": async (_input, output) => {
    if (!output?.env || typeof output.env !== "object" || Array.isArray(output.env)) throw new Error("shell env boundary is invalid");
    output.env.OPENAI_API_KEY = ""; output.env.OPENCODE_AUTH_CONTENT = ""; output.env[ENV] = "";
  }, dispose: async () => { binding = null; } };
};
`;

class MeasurementError extends Error {
  constructor(code, message) { super(message); this.name = "MeasurementError"; this.code = code; }
}

function fail(code, message) { throw new MeasurementError(code, message); }
function expect(condition, code, message) { if (!condition) fail(code, message); }
function sha256Bytes(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function sha256File(file) { return sha256Bytes(fs.readFileSync(file)); }
function readJson(file, label = path.basename(file)) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { fail("MEASUREMENT_JSON", `${label} is invalid`); }
}
function loadMeasurementContract() {
  const contract = readJson(MEASUREMENT_CONTRACT_PATH, "measurement contract");
  expect(contract?.schema_version === 1
    && contract.contract_id === "core-public-ab-oracle-validated-measurement-v1"
    && contract.primary_metric?.name === "oracle_validated_task_success"
    && canonicalJson(contract.primary_metric.definition?.all_of) === canonicalJson([
      "authentic_terminal_completion",
      "timed_out_equals_false",
      "process_containment_intact",
      "no_surviving_descendants",
      "mutation_scope_valid",
      "syntax_verification_passed",
      "changed_paths_nonempty",
      "task_specific_semantic_oracle_passed",
      "hidden_data_leakage_equals_false",
    ])
    && contract.primary_metric.definition?.candidate_additional_requirement === "authentic_current_core_verification_passed"
    && contract.excluded_metrics?.regression_free_task_success?.status === "not_computed"
    && contract.excluded_metrics.regression_free_task_success.reason === "no frozen independent severity oracle"
    && contract.safety_observability?.severe_regression_oracle?.status === "not_available"
    && contract.safety_observability?.high_medium_critical_regressions?.status === "not_observable"
    && contract.safety_observability.high_medium_critical_regressions.count === null
    && contract.safety_observability.high_medium_critical_regressions.rate === null
    && contract.datasets?.development_sensitivity?.included === false
    && contract.model_call_budget?.total_scored === TOTAL_SCORED_CALLS
    && contract.model_call_budget?.maximum_infrastructure_retries === MAXIMUM_INFRASTRUCTURE_RETRIES
    && contract.model_call_budget?.hard_maximum === MAXIMUM_MODEL_CALLS
    && contract.statistics?.paired_bootstrap?.resamples === BOOTSTRAP_RESAMPLES
    && contract.statistics?.paired_bootstrap?.seed === "sha256_measurement_manifest",
  "MEASUREMENT_CONTRACT", "measurement contract differs from the runner's versioned contract");
  return Object.freeze({ contract, fingerprint: fingerprint(contract), sha256: sha256File(MEASUREMENT_CONTRACT_PATH) });
}
function safetyObservability(contract = loadMeasurementContract().contract) {
  return Object.freeze({
    severe_regression_oracle: Object.freeze({ status: contract.safety_observability.severe_regression_oracle.status }),
    high_medium_critical_regressions: Object.freeze({
      status: contract.safety_observability.high_medium_critical_regressions.status,
      count: null,
      rate: null,
    }),
    regression_free_task_success: Object.freeze({
      status: contract.excluded_metrics.regression_free_task_success.status,
      reason: contract.excluded_metrics.regression_free_task_success.reason,
    }),
  });
}
function classifyAttemptSignals(signals) {
  const dispositionEstablished = signals.provider_submission_disposition_established === true;
  if (signals.timed_out === true) {
    return Object.freeze({ oracle_validated_task_success: false, scored_outcome: true,
      infrastructure_failure_before_scoring: false, reconciliation_required: !dispositionEstablished });
  }
  if (signals.process_receipt_observable !== true || signals.explicit_infrastructure_failure === true) {
    return Object.freeze({ oracle_validated_task_success: false, scored_outcome: false,
      infrastructure_failure_before_scoring: dispositionEstablished,
      reconciliation_required: !dispositionEstablished });
  }
  const success = signals.authentic_terminal_completion === true
    && signals.timed_out === false
    && signals.process_containment_intact === true
    && signals.no_surviving_descendants === true
    && signals.mutation_scope_valid === true
    && signals.syntax_verification_success === true
    && signals.no_change === false
    && signals.task_specific_semantic_oracle_passed === true
    && signals.hidden_data_leakage_observed === false
    && (signals.arm !== "core" || signals.authentic_current_core_verification_passed === true);
  return Object.freeze({ oracle_validated_task_success: success, scored_outcome: true,
    infrastructure_failure_before_scoring: false, reconciliation_required: false });
}
function statRegular(file, label) {
  const resolved = fs.realpathSync.native(path.resolve(file));
  const stat = fs.lstatSync(resolved);
  expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
    "MEASUREMENT_FILE", `${label} must be one ordinary file`);
  return Object.freeze({ path: resolved, stat });
}
function statDirectory(directory, label) {
  const resolved = fs.realpathSync.native(path.resolve(directory));
  const stat = fs.lstatSync(resolved);
  expect(stat.isDirectory() && !stat.isSymbolicLink(),
    "MEASUREMENT_DIRECTORY", `${label} must be one real directory`);
  return resolved;
}
function run(file, args, options = {}) {
  return spawnSync(file, args, { encoding: "utf8", shell: false, windowsHide: true,
    maxBuffer: 64 * 1024 * 1024, ...options });
}
function passed(result) { return result.error === undefined && result.signal === null && result.status === 0; }
function git(root, args) { return run("git", args, { cwd: root }); }
function gitSha(root) {
  const result = git(root, ["rev-parse", "HEAD"]);
  expect(passed(result) && SHA.test(result.stdout.trim()), "MEASUREMENT_SOURCE", "source SHA is unavailable");
  return result.stdout.trim();
}
function assertClean(root) {
  const result = git(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
  expect(passed(result) && result.stdout.length === 0, "MEASUREMENT_SOURCE", "frozen runner source is not clean");
}
function durableJson(target, value, { exclusive = true } = {}) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const descriptor = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  if (exclusive && fs.existsSync(target)) { fs.unlinkSync(temporary); fail("MEASUREMENT_IMMUTABLE", `${target} already exists`); }
  fs.renameSync(temporary, target);
  const parent = fs.openSync(path.dirname(target), fs.constants.O_RDONLY);
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
function prepareTrustedMeasurementNode(root, expected) {
  const directory = path.join(root, "trusted-runtime");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, "node");
  if (!fs.existsSync(target)) {
    const temporary = `${target}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
    fs.copyFileSync(process.execPath, temporary, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(temporary, 0o500);
    const descriptor = fs.openSync(temporary, fs.constants.O_RDONLY);
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, target);
    const parent = fs.openSync(directory, fs.constants.O_RDONLY);
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  }
  const executable = statRegular(target, "trusted measurement Node executable");
  expect((executable.stat.mode & 0o077) === 0 && (executable.stat.mode & 0o111) !== 0
    && (typeof process.getuid !== "function" || executable.stat.uid === process.getuid())
    && sha256File(executable.path) === expected.measurement_node_executable_sha256,
  "MEASUREMENT_RUNTIME", "trusted measurement Node executable differs from the frozen binding");
  return executable.path;
}
function appendDurableLine(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const existed = fs.existsSync(target);
  const descriptor = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_APPEND, 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  if (!existed) {
    const parent = fs.openSync(path.dirname(target), fs.constants.O_RDONLY);
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  }
}
function bodyFingerprint(value, fingerprintKey) {
  const body = { ...value }; delete body[fingerprintKey];
  return fingerprint(body);
}
function validateFingerprint(value, key, label) {
  expect(FP.test(value?.[key] ?? "") && value[key] === bodyFingerprint(value, key),
    "MEASUREMENT_FINGERPRINT", `${label} fingerprint is invalid`);
  return value;
}
function canonicalFileInventory(root, relativePaths) {
  return relativePaths.slice().sort().map((relative) => {
    const file = statRegular(path.join(root, ...relative.split("/")), relative);
    return Object.freeze({ path: relative, size: file.stat.size, sha256: sha256File(file.path) });
  });
}
function verifyPublishedBenchmarkInputs(productSourceRoot) {
  const ancestor = git(SOURCE_ROOT, ["merge-base", "--is-ancestor", PRODUCT_SOURCE_SHA, "HEAD"]);
  expect(passed(ancestor), "MEASUREMENT_SOURCE", "measurement runner branch does not descend from the published source SHA");
  const delta = git(SOURCE_ROOT, ["diff", "--name-only", `${PRODUCT_SOURCE_SHA}...HEAD`]);
  expect(passed(delta), "MEASUREMENT_SOURCE", "measurement source delta is unavailable");
  const changed = delta.stdout.trim().split("\n").filter(Boolean);
  expect(changed.every((entry) => MEASUREMENT_SOURCE_ALLOWED_PATHS.includes(entry)
    || MEASUREMENT_SOURCE_ALLOWED_PREFIXES.some((prefix) => entry.startsWith(prefix))),
  "MEASUREMENT_SOURCE", "measurement branch changes a published product or benchmark dependency");
  const published = canonicalFileInventory(productSourceRoot, BENCHMARK_INPUT_PATHS);
  const measurement = canonicalFileInventory(SOURCE_ROOT, BENCHMARK_INPUT_PATHS);
  expect(canonicalJson(published) === canonicalJson(measurement), "MEASUREMENT_SOURCE",
    "corpus, design, or statistics bytes differ from the published source SHA");
  return Object.freeze({ files: Object.freeze(published), fingerprint: fingerprint({ schema_version: 1, files: published }) });
}

function secureEqualAuthorization(actual, capability) {
  const left = Buffer.from(actual ?? "", "utf8"); const right = Buffer.from(`Bearer ${capability}`, "utf8");
  try { return left.length === right.length && timingSafeEqual(left, right); }
  finally { left.fill(0); right.fill(0); }
}
function jwtClaims(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
}
function oauthResidency(token) {
  const claims = jwtClaims(token);
  const value = claims?.["https://api.openai.com/auth"]?.chatgpt_compute_residency ?? claims?.chatgpt_compute_residency;
  return typeof value === "string" && value !== "no_constraint" && /^[A-Za-z0-9._-]{1,128}$/u.test(value) ? value : null;
}
async function createProviderProxy(credentialStore, socketPath) {
  const snapshot = credentialStore.snapshot();
  if (snapshot.auth.expires <= Date.now() + 30_000) await preflightBenchmarkV3ProviderCredentialStore(credentialStore);
  const credentialBroker = await createBenchmarkV3OAuthCredentialBroker({ credentialStore });
  let capability = randomBytes(32).toString("base64url"); let closed = false;
  const sockets = new Set(); const providerControllers = new Set(); const operations = new Set();
  let acceptedRequests = 0; let providerSubmissions = 0; let ambiguousSubmissions = 0;
  const providerResponseStatuses = [];
  const server = createServer((request, response) => {
    const reject = (status, code) => {
      if (!response.headersSent) response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json" });
      response.end(`${JSON.stringify({ error: code })}\n`);
    };
    if (closed || request.method !== "POST" || request.url !== "/proxy"
      || request.headers["transfer-encoding"] !== undefined || !secureEqualAuthorization(request.headers.authorization, capability)) {
      reject(403, "forbidden"); return;
    }
    acceptedRequests += 1;
    const length = Number(request.headers["content-length"] ?? -1);
    if (!Number.isSafeInteger(length) || length < 2 || length > 44 * 1024 * 1024) { reject(413, "request_too_large"); return; }
    const chunks = []; let bytes = 0;
    request.on("data", (chunk) => { bytes += chunk.length; if (bytes <= length) chunks.push(chunk); else request.destroy(); });
    request.on("end", () => {
      const operation = (async () => {
        let body = Buffer.concat(chunks); let providerBody = null; let credentialBody = null;
        try {
        expect(body.length === length, "MEASUREMENT_PROVIDER_PROXY", "provider proxy request length differs");
        const value = JSON.parse(body.toString("utf8"));
        expect(value?.schema_version === 1 && value.method === "POST"
          && ["https://api.openai.com/v1/responses", "https://api.openai.com/v1/chat/completions"].includes(value.url)
          && Array.isArray(value.headers) && typeof value.body_base64 === "string",
        "MEASUREMENT_PROVIDER_PROXY", "provider proxy request is invalid");
        providerBody = Buffer.from(value.body_base64, "base64");
        expect(providerBody.length <= 32 * 1024 * 1024, "MEASUREMENT_PROVIDER_PROXY", "provider body is too large");
        const credentialResponse = await fetch(credentialBroker.payload.broker_url, { method: "POST", redirect: "manual",
          headers: { authorization: `Bearer ${credentialBroker.payload.broker_capability}` } });
        expect(credentialResponse.ok, "MODEL_ACCESS_REQUIRED", `credential broker failed with status ${credentialResponse.status}`);
        credentialBody = Buffer.from(await credentialResponse.arrayBuffer());
        expect(credentialBody.length >= 2 && credentialBody.length <= 64 * 1024,
          "MODEL_ACCESS_REQUIRED", "credential broker response is invalid");
        const credential = JSON.parse(credentialBody.toString("utf8"));
        expect(typeof credential.access === "string" && typeof credential.accountId === "string",
          "MODEL_ACCESS_REQUIRED", "OAuth credential is unavailable");
        const headers = new Headers(value.headers);
        for (const name of ["authorization", "cookie", "host", "content-length", "transfer-encoding"]) headers.delete(name);
        headers.set("authorization", `Bearer ${credential.access}`); headers.set("ChatGPT-Account-Id", credential.accountId);
        const residency = oauthResidency(credential.access); if (residency) headers.set("x-openai-internal-codex-residency", residency);
        const controller = new AbortController(); providerControllers.add(controller);
        let provider;
        try {
          providerSubmissions += 1;
          provider = await fetch("https://chatgpt.com/backend-api/codex/responses", {
            method: "POST", redirect: "manual", headers, body: providerBody, signal: controller.signal,
          });
          providerResponseStatuses.push(provider.status);
        } catch (error) {
          ambiguousSubmissions += 1; providerControllers.delete(controller); throw error;
        }
        let responseBytes;
        try {
          expect(!(provider.status >= 300 && provider.status < 400), "MEASUREMENT_PROVIDER_PROXY", "provider redirect is forbidden");
          const declared = Number(provider.headers.get("content-length") ?? 0);
          expect(!Number.isFinite(declared) || declared <= PROVIDER_RESPONSE_LIMIT,
            "MEASUREMENT_PROVIDER_PROXY", "provider response exceeds the frozen bound");
          try { responseBytes = Buffer.from(await provider.arrayBuffer()); }
          catch (error) { ambiguousSubmissions += 1; throw error; }
        } finally { providerControllers.delete(controller); }
        expect(responseBytes.length <= PROVIDER_RESPONSE_LIMIT, "MEASUREMENT_PROVIDER_PROXY", "provider response is too large");
        const responseHeaders = [];
        for (const name of ["content-type", "x-request-id", "openai-processing-ms"]) {
          const header = provider.headers.get(name); if (header !== null) responseHeaders.push([name, header]);
        }
        const envelope = JSON.stringify({ schema_version: 1, status: provider.status,
          headers: responseHeaders, body_base64: responseBytes.toString("base64") });
        response.writeHead(200, { "cache-control": "no-store", "content-type": "application/json",
          "content-length": Buffer.byteLength(envelope) }); response.end(envelope);
        responseBytes.fill(0);
        } catch (error) {
          reject(error?.code === "MODEL_ACCESS_REQUIRED" ? 401 : 503,
            error?.code === "MODEL_ACCESS_REQUIRED" ? "model_access_required" : "provider_proxy_failure");
        } finally {
          body.fill(0); providerBody?.fill(0); credentialBody?.fill(0);
        }
      })();
      operations.add(operation); operation.then(() => operations.delete(operation), () => operations.delete(operation));
    });
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  server.on("clientError", (_error, socket) => socket.destroy());
  try {
    await new Promise((resolve, reject) => {
      const failed = (error) => { server.off("listening", ready); reject(error); };
      const ready = () => { server.off("error", failed); resolve(); };
      server.once("error", failed); server.once("listening", ready); server.listen(socketPath);
    });
    fs.chmodSync(socketPath, 0o600);
    return Object.freeze({ socket_path: socketPath,
      payload: Object.freeze({ schema_version: 1, provider: "openai", proxy_socket: socketPath,
        proxy_capability: capability }),
      status() { return Object.freeze({ accepted_request_count: acceptedRequests,
        provider_submission_count: providerSubmissions, provider_response_statuses: Object.freeze(providerResponseStatuses.slice()),
        ambiguous_submission_count: ambiguousSubmissions }); },
      async close() {
        if (closed) return; closed = true; capability = ""; for (const controller of providerControllers) controller.abort();
        for (const socket of sockets) socket.destroy();
        await Promise.allSettled([...operations]);
        await new Promise((resolve) => server.close(() => resolve())); await credentialBroker.close();
        try { fs.unlinkSync(socketPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      } });
  } catch (error) {
    closed = true; capability = ""; for (const controller of providerControllers) controller.abort();
    for (const socket of sockets) socket.destroy();
    await Promise.allSettled([...operations]);
    await new Promise((resolve) => server.close(() => resolve())); await credentialBroker.close();
    try { fs.unlinkSync(socketPath); } catch {} throw error;
  }
}

function syntheticAcceptanceProviderBody(url) {
  const text = ACCEPTANCE_TEXT;
  if (url.endsWith("/v1/chat/completions")) {
    const base = { id: "chatcmpl-core-public-ab-acceptance", object: "chat.completion.chunk",
      created: 1, model: MODEL_BINDING.model };
    return Buffer.from([
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ].join(""), "utf8");
  }
  const message = { id: "msg_core_public_ab_acceptance", type: "message", status: "completed",
    role: "assistant", content: [{ type: "output_text", annotations: [], logprobs: [], text }] };
  const completed = { id: "resp_core_public_ab_acceptance", object: "response", created_at: 1,
    status: "completed", error: null, incomplete_details: null, instructions: null,
    max_output_tokens: null, model: MODEL_BINDING.model, output: [message], parallel_tool_calls: true,
    previous_response_id: null, reasoning: { effort: MODEL_BINDING.variant, summary: null }, store: false,
    temperature: 1, text: { format: { type: "text" } }, tool_choice: "auto", tools: [], top_p: 1,
    truncation: "disabled", usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 2 }, metadata: {} };
  const events = [
    { type: "response.created", sequence_number: 0, response: { ...completed, status: "in_progress", output: [] } },
    { type: "response.output_item.added", sequence_number: 1, output_index: 0,
      item: { ...message, status: "in_progress", content: [] } },
    { type: "response.content_part.added", sequence_number: 2, item_id: message.id, output_index: 0,
      content_index: 0, part: { type: "output_text", annotations: [], logprobs: [], text: "" } },
    { type: "response.output_text.delta", sequence_number: 3, item_id: message.id, output_index: 0,
      content_index: 0, delta: text, logprobs: [] },
    { type: "response.output_text.done", sequence_number: 4, item_id: message.id, output_index: 0,
      content_index: 0, text, logprobs: [] },
    { type: "response.content_part.done", sequence_number: 5, item_id: message.id, output_index: 0,
      content_index: 0, part: message.content[0] },
    { type: "response.output_item.done", sequence_number: 6, output_index: 0, item: message },
    { type: "response.completed", sequence_number: 7, response: completed },
  ];
  return Buffer.from(`${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`, "utf8");
}

function jsonContainsExactString(value, expected) {
  if (typeof value === "string") return value === expected;
  if (Array.isArray(value)) return value.some((entry) => jsonContainsExactString(entry, expected));
  return value !== null && typeof value === "object"
    && Object.values(value).some((entry) => jsonContainsExactString(entry, expected));
}

async function createSyntheticAcceptanceProxy(socketPath) {
  let capability = randomBytes(32).toString("base64url"); let closed = false; let acceptedRequests = 0;
  const sockets = new Set();
  const server = createServer((request, response) => {
    const reject = (status, code) => {
      response.writeHead(status, { "cache-control": "no-store", "content-type": "application/json" });
      response.end(`${JSON.stringify({ error: code })}\n`);
    };
    if (closed || request.method !== "POST" || request.url !== "/proxy"
      || !secureEqualAuthorization(request.headers.authorization, capability)) { reject(403, "forbidden"); return; }
    const length = Number(request.headers["content-length"] ?? -1);
    if (!Number.isSafeInteger(length) || length < 2 || length > 44 * 1024 * 1024) { reject(413, "request_too_large"); return; }
    const chunks = []; let bytes = 0;
    request.on("data", (chunk) => { bytes += chunk.length; if (bytes <= length) chunks.push(chunk); else request.destroy(); });
    request.on("end", () => {
      try {
        expect(bytes === length, "MEASUREMENT_ACCEPTANCE", "synthetic provider request length differs");
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        expect(value?.schema_version === 1 && value.method === "POST"
          && ["https://api.openai.com/v1/responses", "https://api.openai.com/v1/chat/completions"].includes(value.url),
        "MEASUREMENT_ACCEPTANCE", "synthetic provider request escaped frozen OpenAI endpoints");
        const providerRequest = JSON.parse(Buffer.from(value.body_base64, "base64").toString("utf8"));
        expect(providerRequest?.model === MODEL_BINDING.model
          && jsonContainsExactString(providerRequest, ACCEPTANCE_PROMPT),
        "MEASUREMENT_ACCEPTANCE", "synthetic provider request differs from the frozen model and acceptance prompt");
        acceptedRequests += 1;
        const providerBody = syntheticAcceptanceProviderBody(value.url);
        const envelope = JSON.stringify({ schema_version: 1, status: 200,
          headers: [["content-type", "text/event-stream"]], body_base64: providerBody.toString("base64") });
        response.writeHead(200, { "cache-control": "no-store", "content-type": "application/json",
          "content-length": Buffer.byteLength(envelope) }); response.end(envelope);
      } catch (error) { reject(503, error?.code ?? "acceptance_proxy_failure"); }
    });
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => {
    const failed = (error) => { server.off("listening", ready); reject(error); };
    const ready = () => { server.off("error", failed); resolve(); };
    server.once("error", failed); server.once("listening", ready); server.listen(socketPath);
  });
  fs.chmodSync(socketPath, 0o600);
  return Object.freeze({ socket_path: socketPath,
    payload: Object.freeze({ schema_version: 1, provider: "openai", proxy_socket: socketPath,
      proxy_capability: capability }),
    status() { return Object.freeze({ accepted_request_count: acceptedRequests,
      provider_submission_count: 0, synthetic_response_count: acceptedRequests }); },
    async close() {
      if (closed) return; closed = true; capability = ""; for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(() => resolve()));
      try { fs.unlinkSync(socketPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    } });
}

function xorshift(seedText) {
  let state = Number.parseInt(createHash("sha256").update(seedText).digest("hex").slice(0, 8), 16) >>> 0;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17; state >>>= 0;
    state ^= state << 5; state >>>= 0;
    return state / 0x1_0000_0000;
  };
}
function quantile(values, probability) {
  const ordered = values.slice().sort((left, right) => left - right);
  const index = (ordered.length - 1) * probability;
  const lower = Math.floor(index); const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower];
  return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower);
}
function pairedBootstrapInterval(pairs, resamples, seed) {
  expect(Array.isArray(pairs) && pairs.length > 0 && Number.isSafeInteger(resamples) && resamples >= 10_000,
    "MEASUREMENT_STATISTICS", "paired bootstrap input is invalid");
  expect(FP.test(seed ?? ""), "MEASUREMENT_STATISTICS", "paired bootstrap seed must be the frozen manifest SHA-256");
  const random = xorshift(seed);
  const deltas = new Array(resamples);
  for (let sample = 0; sample < resamples; sample += 1) {
    let sum = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      sum += Number(pair.core.oracle_validated_task_success) - Number(pair.plain.oracle_validated_task_success);
    }
    deltas[sample] = sum / pairs.length;
  }
  return Object.freeze([quantile(deltas, 0.025), quantile(deltas, 0.975)]);
}
function mean(values) { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { return values.length === 0 ? null : quantile(values, 0.5); }
function p90(values) { return values.length === 0 ? null : quantile(values, 0.9); }
function binomialUpperTail(trials, successes) { return trials === 0 ? 1 : exactBinomialUpperTail(trials, successes, 0.5); }

function buildSchedule(dataset, identities) {
  const entries = [];
  for (const stratum of STRATA) {
    const ranked = identities.filter((entry) => entry.stratum === stratum)
      .map((entry) => Object.freeze({ ...entry,
        rank_hash: sha256Bytes(Buffer.from(`${SCHEDULE_SEED}\0${dataset}\0${entry.id}`, "utf8")) }))
      .sort((left, right) => left.rank_hash.localeCompare(right.rank_hash) || left.id.localeCompare(right.id));
    const plainFirst = Math.ceil(ranked.length / 2);
    ranked.forEach((entry, index) => entries.push(Object.freeze({ identity_id: entry.id, stratum,
      order: Object.freeze(index < plainFirst ? ["plain", "core"] : ["core", "plain"]), rank_hash: entry.rank_hash })));
  }
  const body = { schema_version: 1, dataset, algorithm: "stratum-balanced-hash-rank-v1",
    seed: SCHEDULE_SEED, entries: entries.sort((left, right) => left.identity_id.localeCompare(right.identity_id)) };
  return Object.freeze({ ...body, schedule_fingerprint: fingerprint(body) });
}

function frozenScheduleValid(schedule, dataset, expectedIds, expectedStratumCounts) {
  if (schedule?.schema_version !== 1 || schedule.dataset !== dataset
    || schedule.algorithm !== "stratum-balanced-hash-rank-v1" || schedule.seed !== SCHEDULE_SEED
    || !Array.isArray(schedule.entries) || schedule.schedule_fingerprint !== bodyFingerprint(schedule, "schedule_fingerprint")) return false;
  const entries = schedule.entries;
  if (canonicalJson(entries.map((entry) => entry.identity_id).sort()) !== canonicalJson(expectedIds.slice().sort())
    || new Set(entries.map((entry) => entry.identity_id)).size !== expectedIds.length) return false;
  return STRATA.every((stratum) => {
    const stratumEntries = entries.filter((entry) => entry.stratum === stratum);
    const expectedCount = expectedStratumCounts[stratum];
    return stratumEntries.length === expectedCount
      && stratumEntries.every((entry) => (canonicalJson(entry.order) === canonicalJson(["plain", "core"])
        || canonicalJson(entry.order) === canonicalJson(["core", "plain"])))
      && stratumEntries.every((entry) => entry.rank_hash === sha256Bytes(
        Buffer.from(`${SCHEDULE_SEED}\0${dataset}\0${entry.identity_id}`, "utf8")))
      && stratumEntries.filter((entry) => entry.order[0] === "plain").length === Math.ceil(expectedCount / 2)
      && stratumEntries.filter((entry) => entry.order[0] === "core").length === Math.floor(expectedCount / 2);
  });
}

function runtimeDirectoryFingerprint(directory, confinementRoot) {
  const root = fs.realpathSync.native(directory);
  const confinement = fs.realpathSync.native(confinementRoot);
  const hash = createHash("sha256");
  let fileCount = 0; let directoryCount = 0; let symlinkCount = 0;
  const visit = (current, prefix = "") => {
    for (const name of fs.readdirSync(current).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(current, name);
      const stat = fs.lstatSync(target);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        hash.update(`${canonicalJson([relative, "directory", stat.mode & 0o7777])}\n`); directoryCount += 1; visit(target, relative);
      } else if (stat.isFile() && !stat.isSymbolicLink()) {
        const bytes = fs.readFileSync(target);
        hash.update(`${canonicalJson([relative, "file", stat.mode & 0o7777, bytes.length,
          createHash("sha256").update(bytes).digest("hex")])}\n`); fileCount += 1;
      } else if (stat.isSymbolicLink()) {
        const link = fs.readlinkSync(target); const resolved = fs.realpathSync.native(target);
        const inside = path.relative(confinement, resolved);
        expect(inside !== ".." && !inside.startsWith(`..${path.sep}`) && !path.isAbsolute(inside),
          "MEASUREMENT_RUNTIME", `runtime link escapes confinement: ${relative}`);
        hash.update(`${canonicalJson([relative, "symlink", stat.mode & 0o7777, link])}\n`); symlinkCount += 1;
      } else fail("MEASUREMENT_RUNTIME", `unsupported runtime entry: ${relative}`);
    }
  };
  visit(root);
  return Object.freeze({ fingerprint: `sha256:${hash.digest("hex")}`, file_count: fileCount,
    directory_count: directoryCount, symlink_count: symlinkCount });
}

function verifyPilotArtifact(artifactPath, publicKeyPath) {
  const artifactFile = statRegular(artifactPath, "pilot calibration artifact");
  const keyFile = statRegular(publicKeyPath, "pilot public key");
  const artifact = readJson(artifactFile.path, "pilot calibration artifact");
  expect(artifact.schema_version === 1 && artifact.artifact_kind === "benchmark-v3-epoch2-formal-calibration-v1"
    && artifact.signature?.algorithm === "ed25519" && typeof artifact.signature.value_base64 === "string"
    && artifact.payload?.epoch_id === "epoch2" && artifact.payload.model_calls === 0
    && artifact.payload.candidate_tokens === 0 && artifact.payload.independent_pool_proof?.maximum_independent_identities === 29
    && Array.isArray(artifact.payload.independent_pool) && artifact.payload.independent_pool.length === 29,
  "MEASUREMENT_PILOT", "pilot calibration artifact shape is invalid");
  const payload = artifact.payload;
  const identityIds = payload.independent_pool.map((identity) => identity?.identity_id);
  const storageIds = identityIds.map((identityId) => typeof identityId === "string"
    ? identityId.replace(/[^A-Za-z0-9._-]+/gu, "-") : "");
  expect(identityIds.every((identityId) => typeof identityId === "string" && identityId.length >= 1 && identityId.length <= 256)
    && new Set(identityIds).size === 29 && storageIds.every((identityId) => identityId.length >= 1)
    && new Set(storageIds).size === 29,
  "MEASUREMENT_PILOT", "pilot calibration artifact does not contain 29 unique collision-free identity IDs");
  expect(payload.receipt_fingerprint === fingerprint(Object.fromEntries(Object.entries(payload)
    .filter(([key]) => key !== "receipt_fingerprint"))), "MEASUREMENT_PILOT", "pilot receipt fingerprint is invalid");
  const keyBytes = fs.readFileSync(keyFile.path);
  expect(sha256Bytes(keyBytes) === artifact.issuer_spki_sha256,
    "MEASUREMENT_PILOT", "pilot issuer SPKI fingerprint differs");
  let valid = false;
  try { valid = verifySignature(null, Buffer.from(canonicalJson(payload), "utf8"),
    createPublicKey({ key: keyBytes, format: "der", type: "spki" }), Buffer.from(artifact.signature.value_base64, "base64")); }
  catch { valid = false; }
  expect(valid, "MEASUREMENT_PILOT", "pilot artifact signature is invalid");
  return Object.freeze({ artifact, artifact_sha256: sha256File(artifactFile.path), artifact_size: artifactFile.stat.size,
    public_key_sha256: sha256Bytes(keyBytes) });
}

function pilotPrompt(repository, identity) {
  const result = run("git", ["show", "-s", "--format=%B", identity.source_commit], { cwd: repository });
  expect(passed(result) && result.stdout.trim().length > 0,
    "MEASUREMENT_PILOT", `${identity.identity_id} visible requirement is unavailable`);
  const authored = result.stdout.trim();
  expect(fingerprint(authored) === identity.requirement_fingerprint,
    "MEASUREMENT_PILOT", `${identity.identity_id} visible requirement fingerprint differs`);
  return [
    "Repair the behavior described below. Work only in the supplied repository. Do not use the network, external repositories, hidden tests, or shell commands. Inspect the local source and make the smallest compatible code change. Evaluation runs after you finish.",
    authored,
    `Allowed mutation paths:\n${identity.source_paths.join("\n")}`,
  ].join("\n\n");
}

function createPilotManifest({ artifactPath, publicKeyPath, pilotRoot }) {
  const verified = verifyPilotArtifact(artifactPath, publicKeyPath);
  const root = statDirectory(pilotRoot, "pilot private root");
  const tasks = verified.artifact.payload.independent_pool.map((identity) => {
    expect(PILOT_ADAPTERS[identity.repository_id] !== undefined && STRATA.includes(identity.stratum)
      && Array.isArray(identity.source_paths) && identity.source_paths.length >= 1
      && Array.isArray(identity.hidden_test_files) && identity.hidden_test_files.length >= 1,
    "MEASUREMENT_PILOT", `${identity.identity_id} is outside the frozen pilot contract`);
    const repository = statDirectory(path.join(root, "sources", `${identity.repository_id}.git`), `${identity.repository_id} repository`);
    for (const revision of [identity.parent_commit, identity.source_commit]) {
      const check = run("git", ["cat-file", "-e", `${revision}^{commit}`], { cwd: repository });
      expect(passed(check), "MEASUREMENT_PILOT", `${identity.identity_id} revision is unavailable`);
    }
    const prompt = pilotPrompt(repository, identity);
    const privateTaskBody = { identity_id: identity.identity_id, repository_id: identity.repository_id,
      repository_fingerprint: identity.repository_fingerprint, source_commit: identity.source_commit,
      parent_commit: identity.parent_commit, source_paths: identity.source_paths, test_paths: identity.test_paths,
      before_files_fingerprint: fingerprint(identity.before_files), hidden_test_files_fingerprint: fingerprint(identity.hidden_test_files),
      expected_test_count: identity.expected_test_count, prompt_sha256: sha256Bytes(Buffer.from(prompt, "utf8")), stratum: identity.stratum };
    return Object.freeze({ ...privateTaskBody, task_binding_fingerprint: fingerprint(privateTaskBody) });
  }).sort((left, right) => left.identity_id.localeCompare(right.identity_id));
  const counts = Object.freeze({
    by_repository: Object.freeze(Object.fromEntries(Object.keys(PILOT_ADAPTERS).map((repository) =>
      [repository, tasks.filter((task) => task.repository_id === repository).length]))),
    by_stratum: Object.freeze(Object.fromEntries(STRATA.map((stratum) => [stratum, tasks.filter((task) => task.stratum === stratum).length]))),
  });
  expect(canonicalJson(counts.by_repository) === canonicalJson({ eslint: 8, express: 1, axios: 12, fastify: 8 })
    && canonicalJson(counts.by_stratum) === canonicalJson({ small: 10, medium: 10, high: 9 }),
  "MEASUREMENT_PILOT", "pilot identity distribution differs from the frozen 29-task set");
  const schedule = buildSchedule("pilot", tasks.map((task) => ({ id: task.identity_id, stratum: task.stratum })));
  const body = { schema_version: 1, pilot_id: "core-public-ab-real-repository-pilot-v1",
    private_calibration_artifact_sha256: verified.artifact_sha256,
    private_calibration_artifact_size: verified.artifact_size,
    private_calibration_receipt_fingerprint: verified.artifact.payload.receipt_fingerprint,
    issuer_spki_sha256: verified.public_key_sha256, identity_count: tasks.length, counts, tasks, schedule };
  return Object.freeze({ ...body, pilot_manifest_fingerprint: fingerprint(body) });
}

function representativeRuntimeFamilies(corpus) {
  const representatives = new Map();
  for (const family of corpus.families) {
    const key = family.control_surface.runtime_key;
    const current = representatives.get(key);
    const minor = Number(family.control_surface.runtime_version.split(".")[1] ?? 0);
    const currentMinor = Number(current?.control_surface.runtime_version.split(".")[1] ?? -1);
    if (current === undefined || minor > currentMinor) representatives.set(key, family);
  }
  return representatives;
}
function preparePublicRuntime(repositoryPath, outputPath) {
  const repository = statDirectory(repositoryPath, "public provenance repository");
  const output = path.resolve(outputPath);
  if (fs.existsSync(path.join(output, "RUNTIME.json"))) {
    const verified = loadAndVerifyPublicRuntime(output);
    return Object.freeze({ status: "already-prepared", key_count: verified.runtime.entries.length,
      runtime_fingerprint: verified.runtime.runtime_fingerprint });
  }
  if (fs.existsSync(output)) statDirectory(output, "partial public runtime output");
  else fs.mkdirSync(output, { recursive: false, mode: 0o700 });
  const corpus = loadBenchmarkV3Corpus(SOURCE_ROOT);
  const representatives = representativeRuntimeFamilies(corpus);
  const npmCache = path.join(output, ".npm-cache");
  for (const [key, family] of [...representatives].sort(([left], [right]) => left.localeCompare(right))) {
    const directory = path.join(output, key);
    if (!fs.existsSync(directory)) {
      const clone = run("git", ["clone", "--quiet", "--no-checkout", repository, directory]);
      expect(passed(clone), "MEASUREMENT_RUNTIME", `${key} clone failed`);
      const checkout = run("git", ["checkout", "--quiet", family.control_surface.provenance.parent_commit], { cwd: directory });
      expect(passed(checkout), "MEASUREMENT_RUNTIME", `${key} checkout failed`);
      fs.rmSync(path.join(directory, ".git"), { recursive: true, force: true });
    } else {
      statDirectory(directory, `${key} partial runtime`);
      expect(!fs.existsSync(path.join(directory, ".git")) && fs.existsSync(path.join(directory, "package.json")),
        "MEASUREMENT_RUNTIME", `${key} partial runtime is not resumable`);
    }
    const install = run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock", "--legacy-peer-deps"], {
      cwd: directory, maxBuffer: 16 * 1024 * 1024, timeout: 20 * 60 * 1000,
      env: { ...process.env, NODE_ENV: "development", npm_config_cache: npmCache },
    });
    expect(passed(install), "MEASUREMENT_RUNTIME", `${key} dependency installation failed: ${String(install.stderr).slice(-1000)}`);
    process.stderr.write(`[public-runtime] prepared ${key}\n`);
  }
  const keys = discoverBenchmarkV3SemanticRuntimeKeys(output);
  const runtime = fingerprintBenchmarkV3SemanticRuntime(output, keys);
  durableJson(path.join(output, "RUNTIME.json"), { schema_version: 1, source: PRODUCT_SOURCE_SHA,
    runtime_fingerprint: runtime.runtime_fingerprint, entries: runtime.entries });
  return Object.freeze({ status: "prepared", key_count: keys.length, runtime_fingerprint: runtime.runtime_fingerprint });
}

function loadAndVerifyPublicRuntime(runtimeRoot) {
  const root = statDirectory(runtimeRoot, "public semantic runtime");
  const manifest = readJson(path.join(root, "RUNTIME.json"), "public runtime manifest");
  const runtime = fingerprintBenchmarkV3SemanticRuntime(root, discoverBenchmarkV3SemanticRuntimeKeys(root));
  expect(manifest.schema_version === 1 && manifest.source === PRODUCT_SOURCE_SHA
    && manifest.runtime_fingerprint === runtime.runtime_fingerprint
    && canonicalJson(manifest.entries) === canonicalJson(runtime.entries),
  "MEASUREMENT_RUNTIME", "public semantic runtime differs from its frozen manifest");
  return Object.freeze({ root, manifest, runtime });
}

function loadAndVerifyPilotRuntime(pilotRoot, runtimeManifestPath) {
  const root = statDirectory(pilotRoot, "pilot private root");
  const manifestFile = statRegular(runtimeManifestPath, "pilot runtime manifest");
  const manifest = readJson(manifestFile.path, "pilot runtime manifest");
  expect(manifest.schema_version === 1 && manifest.epoch_id === "epoch2"
    && manifest.platform === process.platform && manifest.architecture === process.arch
    && manifest.node_version === process.version && Array.isArray(manifest.entries),
  "MEASUREMENT_RUNTIME", "pilot runtime manifest is incompatible with this host");
  const relevant = manifest.entries.filter((entry) => PILOT_ADAPTERS[entry.repository_id] !== undefined);
  expect(relevant.length === 4, "MEASUREMENT_RUNTIME", "pilot runtime manifest lacks the four pilot repositories");
  for (const entry of relevant) {
    const worktree = statDirectory(path.join(root, "sources", `${entry.repository_id}-work`), `${entry.repository_id} runtime`);
    expect(sha256File(path.join(worktree, "package.json")) === entry.package_json_sha256
      && sha256File(path.join(worktree, entry.lockfile)) === entry.lockfile_sha256,
    "MEASUREMENT_RUNTIME", `${entry.repository_id} runtime manifests drifted`);
    const tree = runtimeDirectoryFingerprint(path.join(worktree, "node_modules"), worktree);
    expect(tree.fingerprint === entry.installed_tree_fingerprint && tree.file_count === entry.installed_file_count
      && tree.directory_count === entry.installed_directory_count && tree.symlink_count === entry.installed_symlink_count,
    "MEASUREMENT_RUNTIME", `${entry.repository_id} installed runtime drifted`);
  }
  return Object.freeze({ root, manifest, relevant, manifest_sha256: sha256File(manifestFile.path) });
}

function evaluatorFingerprint() {
  const files = canonicalFileInventory(SOURCE_ROOT, [...BENCHMARK_INPUT_PATHS,
    "scripts/benchmark-core-public-ab.mjs", "research/measurements/core-public-ab-v1/measurement-contract.v1.json"]);
  return fingerprint({ schema_version: 1, files, public_oracle: "runner-owned-hidden-tests-seatbelt-no-network-v1",
    pilot_oracle: "epoch2-calibration-bytes-seatbelt-no-network-v1", task_success: "oracle-validated-task-success-v1",
    statistics: { bootstrap_resamples: BOOTSTRAP_RESAMPLES, bootstrap_seed: "measurement-manifest-fingerprint",
      mcnemar: "exact-binomial-discordant-pairs", one_sided_direction: "core-greater-than-plain" } });
}

function verifyExactModelCatalog(opencodePath) {
  const result = run(opencodePath, ["models", MODEL_BINDING.provider, "--verbose"], { timeout: 30_000 });
  const output = `${result.stdout}\n${result.stderr}`;
  const entries = [];
  if (passed(result)) {
    const lines = output.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const label = lines[index].trim();
      if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(label) || lines[index + 1]?.trim() !== "{") continue;
      let source = ""; let parsed = null;
      for (index += 1; index < lines.length; index += 1) {
        source += `${lines[index]}\n`;
        try { parsed = JSON.parse(source); } catch { continue; }
        entries.push(Object.freeze({ label, value: parsed })); break;
      }
    }
  }
  const target = entries.filter((entry) => entry.label === `${MODEL_BINDING.provider}/${MODEL_BINDING.model}`
    && entry.value?.id === MODEL_BINDING.model && entry.value?.providerID === MODEL_BINDING.provider
    && entry.value?.api?.id === MODEL_BINDING.model && entry.value?.status === "active");
  if (target.length !== 1 || target[0].value?.variants?.[MODEL_BINDING.variant]?.reasoningEffort !== MODEL_BINDING.variant) {
    fail("MODEL_ACCESS_REQUIRED", "exact openai/gpt-5.6-luna/low binding is absent from the OpenCode model catalog");
  }
  return Object.freeze({ model_catalog_entry: `${MODEL_BINDING.provider}/${MODEL_BINDING.model}`,
    variant: MODEL_BINDING.variant });
}

function verifyOpenCodeSeatbeltStartup(opencode) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-opencode-preflight-"));
  try {
    const workspace = path.join(root, "workspace"); const attempt = path.join(root, "attempt");
    const configuration = path.join(attempt, "configuration");
    for (const directory of [workspace, attempt, configuration]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const socketPath = path.join(root, "provider.sock"); fs.writeFileSync(socketPath, "preflight", { mode: 0o600 });
    const credentialFile = path.join(attempt, "credential.json"); fs.writeFileSync(credentialFile, "{}", { mode: 0o600 });
    const plugins = path.join(configuration, "plugins"); fs.mkdirSync(plugins, { mode: 0o700 });
    const pluginFile = path.join(plugins, "startup-preflight.mjs");
    fs.writeFileSync(pluginFile, "export default async () => ({});\n", { mode: 0o400 });
    const profile = path.join(root, "model.sb");
    fs.writeFileSync(profile, modelSandboxProfile({ workspace, attemptDirectory: attempt,
      opencodePath: opencode.path, providerProxySocket: socketPath, trustedNodePath: process.execPath }), { mode: 0o600 });
    const binding = providerExecutionBinding(attempt, configuration, {
      placeholder_auth_content: "{}", credential_file: credentialFile, plugin_file: pluginFile,
    });
    const result = run("/usr/bin/sandbox-exec", ["-f", profile, opencode.path, "--version"], {
      cwd: workspace, env: binding.environment, timeout: 30_000,
    });
    expect(passed(result) && result.stdout.trim() === opencode.version,
      "MEASUREMENT_CONTAINMENT", `OpenCode Seatbelt startup failed: status=${result.status} signal=${result.signal}`);
    const debug = run("/usr/bin/sandbox-exec", ["-f", profile, opencode.path, "debug", "paths"], {
      cwd: workspace, env: binding.environment, timeout: 30_000,
    });
    expect(passed(debug), "MEASUREMENT_CONTAINMENT",
      `OpenCode Seatbelt debug startup failed: status=${debug.status} signal=${debug.signal}`);
    return Object.freeze({ status: "passed", version: opencode.version });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function verifyTrustedNodeCatalogPreflight(coreBundle, expected) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-node-preflight-"));
  try {
    const workspace = path.join(root, "workspace"); fs.mkdirSync(workspace, { mode: 0o700 });
    expect(passed(run("git", ["init", "--quiet"], { cwd: workspace })),
      "MEASUREMENT_RUNTIME", "trusted Node preflight Git initialization failed");
    fs.writeFileSync(path.join(workspace, "probe.js"), "export default true;\n", { mode: 0o600 });
    expect(passed(run("git", ["add", "."], { cwd: workspace })),
      "MEASUREMENT_RUNTIME", "trusted Node preflight index creation failed");
    const trustedNodePath = prepareTrustedMeasurementNode(root, expected);
    await installCatalog(workspace, { allowed_mutation_paths: ["probe.js"], subject_paths: ["probe.js"] },
      coreBundle, trustedNodePath);
    return Object.freeze({ status: "passed" });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function freezeManifests(options) {
  assertClean(SOURCE_ROOT);
  const measurementContract = loadMeasurementContract();
  const runnerSha256 = sha256File(RUNNER_PATH);
  const productSourceRoot = statDirectory(options.productSourceRoot, "product source root");
  assertClean(productSourceRoot);
  expect(gitSha(productSourceRoot) === PRODUCT_SOURCE_SHA, "MEASUREMENT_SOURCE", "product source SHA differs");
  const publishedInputs = verifyPublishedBenchmarkInputs(productSourceRoot);
  const product = verifyBenchmarkV3ProductBundle(productSourceRoot, options.coreBundle);
  expect(product.product_bundle_fingerprint === CORE_BUNDLE_FINGERPRINT,
    "MEASUREMENT_PRODUCT", "core bundle differs from the frozen candidate fingerprint");
  const opencode = verifyBenchmarkV3OpenCodeExecutable(path.resolve(options.opencode));
  expect(opencode.variant_supported, "MEASUREMENT_MODEL", "OpenCode lacks --variant support");
  verifyExactModelCatalog(opencode.path);
  const opencodeSeatbeltStartup = verifyOpenCodeSeatbeltStartup(opencode);
  const measurementNode = Object.freeze({ measurement_node_version: process.version,
    measurement_node_executable_sha256: sha256File(process.execPath) });
  const trustedNodeCatalogPreflight = await verifyTrustedNodeCatalogPreflight(
    product.materialized_core_directory, measurementNode);
  const publicRuntime = loadAndVerifyPublicRuntime(options.publicRuntime);
  const pilotRuntime = loadAndVerifyPilotRuntime(options.pilotRoot, options.pilotRuntimeManifest);
  const pilotManifest = createPilotManifest({ artifactPath: options.pilotArtifact,
    publicKeyPath: options.pilotPublicKey, pilotRoot: options.pilotRoot });
  const corpus = loadBenchmarkV3Corpus(productSourceRoot);
  const validation = corpus.families.filter((family) => family.split === "validation");
  expect(validation.length === 60
    && new Set(validation.map((family) => family.family_id)).size === 60
    && STRATA.every((stratum) => validation.filter((family) => family.stratum === stratum).length === 20),
  "MEASUREMENT_CORPUS", "public validation split counts differ");
  const schedules = Object.freeze({
    validation: buildSchedule("validation", validation.map((family) => ({ id: family.family_id, stratum: family.stratum }))),
    pilot: pilotManifest.schedule,
  });
  expect(DATASETS.every((dataset) => STRATA.every((stratum) => {
    const entries = schedules[dataset].entries.filter((entry) => entry.stratum === stratum);
    const expectedPlainFirst = Math.ceil(entries.length / 2);
    return entries.filter((entry) => entry.order[0] === "plain").length === expectedPlainFirst
      && entries.filter((entry) => entry.order[0] === "core").length === entries.length - expectedPlainFirst;
  })), "MEASUREMENT_SCHEDULE", "frozen arm-order schedule is not counterbalanced by dataset and stratum");
  const bundleManifest = readJson(path.join(product.materialized_core_directory, ".opencode-profile-manifest.json"), "core bundle manifest");
  const body = {
    schema_version: 1,
    measurement_id: "core-public-ab-v1",
    runner_sha256: runnerSha256,
    runner_source_sha: gitSha(SOURCE_ROOT),
    measurement_contract_fingerprint: measurementContract.fingerprint,
    measurement_contract_sha256: measurementContract.sha256,
    product_source_sha: PRODUCT_SOURCE_SHA,
    product_tree_fingerprint: bundleManifest.source_tree_fingerprint,
    core_bundle_fingerprint: product.product_bundle_fingerprint,
    public_corpus_fingerprint: corpus.corpus_fingerprint,
    corpus_fingerprint: corpus.corpus_fingerprint,
    published_benchmark_input_fingerprint: publishedInputs.fingerprint,
    published_benchmark_input_files: publishedInputs.files,
    validation_family_ids: validation.map((family) => family.family_id),
    real_pilot_identity_ids: pilotManifest.tasks.map((task) => task.identity_id),
    primary_dataset: Object.freeze({ split: "validation", family_count: 60, small: 20, medium: 20, high: 20,
      family_ids: validation.map((family) => family.family_id) }),
    pilot_dataset: Object.freeze({ family_count: 29, small: 10, medium: 10, high: 9,
      repositories: pilotManifest.counts.by_repository,
      identity_ids: pilotManifest.tasks.map((task) => task.identity_id) }),
    task_binding_fingerprints: Object.freeze({
      validation: Object.freeze(Object.fromEntries(validation.map((family) => [family.family_id, family.manifest.public_surface_fingerprint]))),
      pilot: Object.freeze(Object.fromEntries(pilotManifest.tasks.map((task) => [task.identity_id, task.task_binding_fingerprint]))),
    }),
    primary_metric_definition: measurementContract.contract.primary_metric,
    primary_metric: "oracle_validated_task_success",
    explicitly_excluded_metric: Object.freeze({ name: "regression_free_task_success",
      ...measurementContract.contract.excluded_metrics.regression_free_task_success }),
    safety_observability: measurementContract.contract.safety_observability,
    excluded_metrics: measurementContract.contract.excluded_metrics,
    severe_regression_safety: Object.freeze({ status: "not_observable" }),
    real_pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint,
    model: MODEL_BINDING.model,
    provider: MODEL_BINDING.provider,
    variant: MODEL_BINDING.variant,
    model_binding: MODEL_BINDING,
    opencode_version: opencode.version,
    opencode_executable_sha256: opencode.sha256,
    opencode_executable_fingerprint: opencode.executable_fingerprint,
    ...measurementNode,
    opencode_seatbelt_startup_preflight: opencodeSeatbeltStartup,
    trusted_measurement_node_catalog_preflight: trustedNodeCatalogPreflight,
    timeout_ms: Number(options.timeoutMs),
    parallel_pairs: Number(options.parallelPairs),
    arm_order_schedule: schedules,
    arm_order_schedule_fingerprint: fingerprint(schedules),
    retry_policy: "one retry only for proven pre-scoring infrastructure failure",
    retry_policy_detail: Object.freeze({ exact_resume: true, maximum_infrastructure_retries_per_task_arm: 1,
      retry_eligible: "proven-infrastructure-failure-before-scored-outcome-only",
      forbidden: Object.freeze(["timeout", "bad-solution", "model-protocol-failure", "failed-hidden-test", "failed-core-verification", "already-scored-outcome"]) }),
    model_call_budget: Object.freeze({ primary_scored: PRIMARY_SCORED_CALLS, pilot_scored: PILOT_SCORED_CALLS,
      total_scored: TOTAL_SCORED_CALLS, maximum_infrastructure_retries: MAXIMUM_INFRASTRUCTURE_RETRIES,
      hard_maximum: MAXIMUM_MODEL_CALLS }),
    bootstrap_resamples: BOOTSTRAP_RESAMPLES,
    statistics: Object.freeze({ primary: "paired delta, exact McNemar, deterministic paired bootstrap" }),
    maximum_scored_model_calls: TOTAL_SCORED_CALLS,
    maximum_total_model_calls: MAXIMUM_MODEL_CALLS,
    evaluator_fingerprint: evaluatorFingerprint(),
    public_semantic_runtime_fingerprint: publicRuntime.runtime.runtime_fingerprint,
    pilot_runtime_universe_fingerprint: pilotRuntime.manifest.runtime_universe_fingerprint,
    pilot_runtime_manifest_sha256: pilotRuntime.manifest_sha256,
    private_pilot_artifact_sha256: pilotManifest.private_calibration_artifact_sha256,
    statistical_method: Object.freeze({ paired_ci: "deterministic-percentile-paired-bootstrap",
      resamples: BOOTSTRAP_RESAMPLES, seed: "measurement-manifest-fingerprint", confidence_level: 0.95,
      primary_test: "exact-mcnemar", one_sided_direction: "core-greater-than-plain" }),
    development_sensitivity: Object.freeze({ included: false,
      reason: "bounded measurement uses validation primary plus frozen real-commit pilot" }),
    execution_policy: Object.freeze({ dataset_order: Object.freeze(["validation", "pilot"]), opportunity_gate: false,
      model_network: "provider-only-through-host-isolated-credential-bridge",
      model_tools: Object.freeze({ local_read_edit: "allow", shell: "deny", web: "deny", external_directory: "deny", delegation: "deny" }) }),
    acceptance_probe: Object.freeze({ required_before_campaign: true, arms: ARMS,
      provider_mode: "deterministic-local-proxy-no-external-submission", model_calls: 0, provider_calls: 0,
      prompt_sha256: sha256Bytes(Buffer.from(ACCEPTANCE_PROMPT, "utf8")),
      expected_text_sha256: sha256Bytes(Buffer.from(ACCEPTANCE_TEXT, "utf8")) }),
    created_at: new Date().toISOString(),
  };
  expect(Number.isSafeInteger(body.timeout_ms) && body.timeout_ms >= 60_000
    && Number.isSafeInteger(body.parallel_pairs) && body.parallel_pairs >= 1 && body.parallel_pairs <= 8,
  "MEASUREMENT_MANIFEST", "timeout or parallelism is invalid");
  const manifest = Object.freeze({ ...body, manifest_fingerprint: fingerprint(body) });
  durableJson(path.resolve(options.pilotManifestOutput), pilotManifest);
  durableJson(path.resolve(options.manifestOutput), manifest);
  return Object.freeze({ status: "frozen", manifest_fingerprint: manifest.manifest_fingerprint,
    runner_sha256: runnerSha256, core_bundle_fingerprint: product.product_bundle_fingerprint,
    pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint });
}

function validateMeasurementManifest(file) {
  const manifestFile = statRegular(file, "measurement manifest");
  const manifest = validateFingerprint(readJson(manifestFile.path, "measurement manifest"),
    "manifest_fingerprint", "measurement manifest");
  const measurementContract = loadMeasurementContract();
  expect(manifest.schema_version === 1 && manifest.measurement_id === "core-public-ab-v1"
    && manifest.runner_sha256 === sha256File(RUNNER_PATH) && manifest.product_source_sha === PRODUCT_SOURCE_SHA
    && SHA.test(manifest.runner_source_sha ?? "")
    && manifest.measurement_contract_fingerprint === measurementContract.fingerprint
    && manifest.measurement_contract_sha256 === measurementContract.sha256
    && FP.test(manifest.product_tree_fingerprint ?? "")
    && manifest.core_bundle_fingerprint === CORE_BUNDLE_FINGERPRINT
    && FP.test(manifest.corpus_fingerprint ?? "") && manifest.corpus_fingerprint === manifest.public_corpus_fingerprint
    && manifest.primary_dataset?.split === "validation" && manifest.primary_dataset?.family_count === 60
    && manifest.primary_dataset?.small === 20 && manifest.primary_dataset?.medium === 20 && manifest.primary_dataset?.high === 20
    && canonicalJson(manifest.primary_dataset?.family_ids) === canonicalJson(manifest.validation_family_ids)
    && manifest.pilot_dataset?.family_count === 29 && manifest.pilot_dataset?.small === 10
    && manifest.pilot_dataset?.medium === 10 && manifest.pilot_dataset?.high === 9
    && canonicalJson(manifest.pilot_dataset?.repositories) === canonicalJson(PILOT_REPOSITORY_COUNTS)
    && canonicalJson(manifest.pilot_dataset?.identity_ids) === canonicalJson(manifest.real_pilot_identity_ids)
    && manifest.primary_metric === "oracle_validated_task_success"
    && manifest.excluded_metrics?.regression_free_task_success?.status === "not_computed"
    && manifest.excluded_metrics.regression_free_task_success.reason === "no frozen independent severity oracle"
    && manifest.severe_regression_safety?.status === "not_observable"
    && manifest.provider === MODEL_BINDING.provider && manifest.model === MODEL_BINDING.model
    && manifest.variant === MODEL_BINDING.variant && canonicalJson(manifest.model_binding) === canonicalJson(MODEL_BINDING)
    && manifest.evaluator_fingerprint === evaluatorFingerprint()
    && FP.test(manifest.opencode_executable_fingerprint ?? "")
    && manifest.arm_order_schedule_fingerprint === fingerprint(manifest.arm_order_schedule)
    && manifest.retry_policy === "one retry only for proven pre-scoring infrastructure failure"
    && manifest.retry_policy_detail?.exact_resume === true
    && manifest.retry_policy_detail?.maximum_infrastructure_retries_per_task_arm === 1
    && manifest.bootstrap_resamples === BOOTSTRAP_RESAMPLES
    && manifest.statistics?.primary === "paired delta, exact McNemar, deterministic paired bootstrap"
    && manifest.maximum_scored_model_calls === TOTAL_SCORED_CALLS
    && manifest.maximum_total_model_calls === MAXIMUM_MODEL_CALLS
    && Number.isSafeInteger(manifest.timeout_ms) && manifest.timeout_ms >= 60_000
    && Number.isSafeInteger(manifest.parallel_pairs) && manifest.parallel_pairs >= 1 && manifest.parallel_pairs <= 8
    && manifest.measurement_node_version === process.version
    && manifest.measurement_node_executable_sha256 === sha256File(process.execPath)
    && manifest.opencode_seatbelt_startup_preflight?.status === "passed"
    && manifest.trusted_measurement_node_catalog_preflight?.status === "passed"
    && manifest.published_benchmark_input_fingerprint === fingerprint({ schema_version: 1,
      files: canonicalFileInventory(SOURCE_ROOT, BENCHMARK_INPUT_PATHS) })
    && manifest.validation_family_ids.length === 60 && new Set(manifest.validation_family_ids).size === 60
    && manifest.real_pilot_identity_ids.length === 29 && new Set(manifest.real_pilot_identity_ids).size === 29
    && frozenScheduleValid(manifest.arm_order_schedule?.validation, "validation", manifest.validation_family_ids,
      { small: 20, medium: 20, high: 20 })
    && frozenScheduleValid(manifest.arm_order_schedule?.pilot, "pilot", manifest.real_pilot_identity_ids,
      { small: 10, medium: 10, high: 9 })
    && manifest.primary_metric_definition?.name === "oracle_validated_task_success"
    && manifest.explicitly_excluded_metric?.status === "not_computed"
    && manifest.safety_observability?.high_medium_critical_regressions?.count === null
    && manifest.development_sensitivity?.included === false
    && canonicalJson(manifest.execution_policy?.dataset_order) === canonicalJson(DATASETS)
    && manifest.execution_policy?.opportunity_gate === false
    && manifest.acceptance_probe?.required_before_campaign === true
    && canonicalJson(manifest.acceptance_probe?.arms) === canonicalJson(ARMS)
    && manifest.acceptance_probe?.model_calls === 0 && manifest.acceptance_probe?.provider_calls === 0
    && manifest.acceptance_probe?.prompt_sha256 === sha256Bytes(Buffer.from(ACCEPTANCE_PROMPT, "utf8"))
    && manifest.acceptance_probe?.expected_text_sha256 === sha256Bytes(Buffer.from(ACCEPTANCE_TEXT, "utf8"))
    && manifest.statistical_method?.seed === "measurement-manifest-fingerprint"
    && manifest.model_call_budget?.hard_maximum === MAXIMUM_MODEL_CALLS,
  "MEASUREMENT_MANIFEST", "measurement manifest differs from the frozen runner contract");
  return Object.freeze({ path: manifestFile.path, manifest, sha256: sha256File(manifestFile.path) });
}

function safeRelative(relative) {
  expect(typeof relative === "string" && relative.length > 0 && !path.isAbsolute(relative)
    && !relative.split(/[\\/]/u).includes("..") && !relative.includes("\0"),
  "MEASUREMENT_PATH", "unsafe task path");
  return relative;
}
function stageFiles(root, files) {
  for (const entry of files) {
    const relative = safeRelative(entry.path); const target = path.resolve(root, ...relative.split("/"));
    const inside = path.relative(root, target);
    expect(inside !== ".." && !inside.startsWith(`..${path.sep}`) && !path.isAbsolute(inside),
      "MEASUREMENT_PATH", "staged task file escaped workspace");
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, entry.content, "utf8");
  }
}
function captureWorkspace(root) {
  const entries = [];
  const visit = (directory, prefix = "") => {
    for (const name of fs.readdirSync(directory).sort()) {
      if (prefix === "" && [".git", "node_modules"].includes(name)) continue;
      const relative = prefix === "" ? name : `${prefix}/${name}`; const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      expect(!stat.isSymbolicLink() && (stat.isDirectory() || (stat.isFile() && stat.nlink === 1)),
        "MEASUREMENT_WORKSPACE", `unsupported workspace entry: ${relative}`);
      if (stat.isDirectory()) visit(target, relative);
      else entries.push(Object.freeze({ path: relative, sha256: sha256File(target), size: stat.size, mode: stat.mode & 0o7777 }));
    }
  };
  visit(root);
  return Object.freeze({ entries, fingerprint: fingerprint(entries) });
}
function observeHiddenDataExposure(task, workspace) {
  const visible = captureWorkspace(workspace);
  const hidden = task.hidden_test_files.map((entry) => Object.freeze({
    path: safeRelative(entry.path),
    sha256: sha256Bytes(Buffer.from(entry.content, "utf8")),
    content: entry.content,
  }));
  const hiddenHashes = new Set(hidden.map((entry) => entry.sha256));
  const exposedPaths = hidden.filter((entry) => fs.existsSync(path.join(workspace, ...entry.path.split("/"))))
    .map((entry) => entry.path);
  const exposedContentHashes = visible.entries.filter((entry) => hiddenHashes.has(entry.sha256))
    .map((entry) => entry.sha256);
  const promptExposures = hidden.filter((entry) => entry.content.length > 0 && task.prompt.includes(entry.content))
    .map((entry) => entry.sha256);
  const body = { schema_version: 1, checked_hidden_path_count: hidden.length,
    hidden_control_hashes: [...hiddenHashes].sort(),
    model_visible_workspace_fingerprint: visible.fingerprint,
    exposed_paths: exposedPaths.sort(), exposed_content_hashes: [...new Set(exposedContentHashes)].sort(),
    prompt_exposure_hashes: [...new Set(promptExposures)].sort() };
  const leakageObserved = body.exposed_paths.length > 0 || body.exposed_content_hashes.length > 0
    || body.prompt_exposure_hashes.length > 0;
  return Object.freeze({ leakage_observed: leakageObserved, preflight_fingerprint: fingerprint(body) });
}
function changedPaths(before, after) {
  const left = new Map(before.entries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}:${entry.mode}`]));
  const right = new Map(after.entries.map((entry) => [entry.path, `${entry.sha256}:${entry.size}:${entry.mode}`]));
  return [...new Set([...left.keys(), ...right.keys()])].filter((entry) => left.get(entry) !== right.get(entry)).sort();
}
function copyConfiguration(source, destination) {
  if (source === null) fs.mkdirSync(destination, { mode: 0o700 });
  else fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
}
function directoryFingerprint(directory) {
  const entries = [];
  const visit = (current, prefix = "") => {
    for (const name of fs.readdirSync(current).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`; const target = path.join(current, name); const stat = fs.lstatSync(target);
      expect(!stat.isSymbolicLink() && (stat.isDirectory() || (stat.isFile() && stat.nlink === 1)),
        "MEASUREMENT_CONFIG", "configuration contains unsupported entry");
      if (stat.isDirectory()) visit(target, relative);
      else entries.push({ path: relative, size: stat.size, sha256: sha256File(target) });
    }
  };
  visit(directory); return fingerprint(entries);
}
function candidateCheck(task, trustedNodePath) {
  const syntaxProgram = "const{spawnSync}=require('node:child_process');for(const f of process.argv.slice(1)){const r=spawnSync(process.execPath,['--check',f],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)}";
  return Object.freeze({ check_id: "core-public-ab-syntax-all", scope_prefixes: task.allowed_mutation_paths.slice().sort(),
    cost_rank: 1, executable_path: fs.realpathSync.native(trustedNodePath), argv: ["-e", syntaxProgram],
    immutable_input_paths: [], subject_paths: task.subject_paths, cwd: ".", timeout_ms: 30_000 });
}
async function installCatalog(workspace, task, coreBundle, trustedNodePath) {
  const target = path.join(workspace, ".git", "opencode-harness", "core", "checks.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ schema_version: 2, catalog_id: "core-public-ab-public", checks: [candidateCheck(task, trustedNodePath)] })}\n`);
  const runtime = await import(pathToFileURL(path.join(coreBundle, "runtime", "core-verification-runtime.mjs")).href);
  const catalog = runtime.loadCoreVerificationCatalog(workspace);
  expect(catalog.catalog_status === "loaded" && catalog.checks.length === 1,
    "MEASUREMENT_CATALOG", "frozen core catalog did not load exactly one check");
  return Object.freeze({ sha256: sha256File(target), catalog_fingerprint: catalog.catalog_fingerprint,
    command_fingerprint: runtime.coreTrustedCheckCommandFingerprint(catalog.checks[0]) });
}
function materializeTaskWorkspace(task, repositories) {
  const repository = repositories[task.repository_id];
  const workspace = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-task-"));
  const clone = run("git", ["clone", "--quiet", "--no-checkout", repository, workspace]);
  expect(passed(clone), "MEASUREMENT_WORKSPACE", `${task.id} clone failed`);
  const checkout = run("git", ["checkout", "--quiet", task.parent_commit], { cwd: workspace });
  expect(passed(checkout), "MEASUREMENT_WORKSPACE", `${task.id} parent checkout failed`);
  fs.rmSync(path.join(workspace, ".git"), { recursive: true, force: true });
  for (const hidden of task.hidden_test_files) fs.rmSync(path.join(workspace, ...safeRelative(hidden.path).split("/")), { force: true });
  stageFiles(workspace, task.before_files);
  expect(passed(run("git", ["init", "--quiet"], { cwd: workspace }))
    && passed(run("git", ["add", "."], { cwd: workspace })),
  "MEASUREMENT_WORKSPACE", `${task.id} isolated git initialization failed`);
  return fs.realpathSync.native(workspace);
}
function isolateHiddenOracleWorkspace(modelWorkspace) {
  const oracleWorkspace = path.join(fs.realpathSync.native(os.tmpdir()),
    `core-public-ab-hidden-oracle-${process.pid}-${randomBytes(16).toString("hex")}`);
  try {
    fs.cpSync(modelWorkspace, oracleWorkspace, { recursive: true, force: false, errorOnExist: false });
    fs.rmSync(modelWorkspace, { recursive: true, force: true });
    return fs.realpathSync.native(oracleWorkspace);
  } catch (error) {
    fs.rmSync(oracleWorkspace, { recursive: true, force: true }); throw error;
  }
}

function sandboxLiteral(value) { return JSON.stringify(fs.realpathSync.native(value)); }
function sandboxDirectoryAncestors(values) {
  const ancestors = new Set();
  for (const value of values) {
    let current = path.dirname(fs.realpathSync.native(value));
    while (current !== path.dirname(current)) { ancestors.add(current); current = path.dirname(current); }
  }
  return [...ancestors].sort();
}
function modelSandboxProfile({ workspace, attemptDirectory, opencodePath, providerProxySocket, trustedNodePath }) {
  expect(process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec"),
    "MEASUREMENT_CONTAINMENT", "macOS Seatbelt is required for this frozen runner");
  const system = ["/System", "/usr", "/Library", "/opt/homebrew", "/private/var/db/timezone",
    path.dirname(process.execPath), trustedNodePath ? path.dirname(trustedNodePath) : null]
    .filter((entry, index, values) => entry !== null && fs.existsSync(entry) && values.indexOf(entry) === index);
  const ancestorReads = sandboxDirectoryAncestors([workspace, attemptDirectory, opencodePath,
    ...(trustedNodePath ? [trustedNodePath] : [])]);
  return ["(version 1)", "(deny default)", "(allow process-exec process-fork)",
    "(allow signal (target same-sandbox))", "(allow process-info* (target same-sandbox))",
    `(allow network-outbound (literal ${JSON.stringify(path.resolve(providerProxySocket))}))`,
    "(allow mach-lookup)", "(allow sysctl-read)",
    "(allow ipc-posix-shm-read-data (literal \"apple.shm.notification_center\"))",
    "(allow file-read-metadata)",
    `(allow file-read-data (literal \"/\") (literal \"/dev/null\") ${ancestorReads.map((entry) => `(literal ${JSON.stringify(entry)})`).join(" ")})`,
    `(allow file-read* ${system.map((entry) => `(subpath ${sandboxLiteral(entry)})`).join(" ")}`,
    `  (subpath ${sandboxLiteral(workspace)}) (subpath ${sandboxLiteral(attemptDirectory)}) (literal ${sandboxLiteral(opencodePath)}))`,
    `(allow file-write* (subpath ${sandboxLiteral(workspace)}) (subpath ${sandboxLiteral(attemptDirectory)}) (literal "/dev/null"))`,
  ].join("\n");
}
function oracleSandboxProfile({ workspace, runtime, temporary }) {
  const system = ["/System", "/usr", "/Library", "/opt/homebrew", path.dirname(process.execPath)]
    .filter((entry, index, values) => fs.existsSync(entry) && values.indexOf(entry) === index);
  return ["(version 1)", "(deny default)", "(allow process-exec process-fork)",
    "(allow signal (target same-sandbox))", "(allow process-info* (target same-sandbox))", "(deny network*)",
    "(allow mach-lookup)", "(allow sysctl-read)", "(allow file-read-metadata)", "(allow file-read-data (literal \"/\"))",
    `(allow file-read* ${system.map((entry) => `(subpath ${sandboxLiteral(entry)})`).join(" ")}`,
    `  (subpath ${sandboxLiteral(workspace)}) (subpath ${sandboxLiteral(runtime)}) (subpath ${sandboxLiteral(temporary)}))`,
    `(allow file-write* (subpath ${sandboxLiteral(workspace)}) (subpath ${sandboxLiteral(temporary)}) (literal "/dev/null"))`,
  ].join("\n");
}
function boundProviderPluginFile(attemptDirectory, configuration, credential) {
  const attemptRoot = fs.realpathSync.native(attemptDirectory);
  const pluginRoot = fs.realpathSync.native(path.join(configuration, "plugins"));
  const pluginFile = statRegular(credential.plugin_file, "provider proxy plugin").path;
  const pluginRelative = path.relative(attemptRoot, pluginFile);
  expect(pluginRelative.length > 0 && pluginRelative !== ".." && !pluginRelative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(pluginRelative) && path.dirname(pluginFile) === pluginRoot,
  "MEASUREMENT_CREDENTIAL_BOUNDARY", "provider proxy plugin escaped the private attempt directory");
  return pluginFile;
}
function providerConfigurationBaseline(attemptDirectory, configuration, credential) {
  boundProviderPluginFile(attemptDirectory, configuration, credential);
  return directoryFingerprint(configuration);
}
function modelEnvironment(attemptDirectory, configuration, credential) {
  const isolatedHome = path.join(attemptDirectory, "home"); const isolatedTmp = path.join(attemptDirectory, "tmp");
  const data = path.join(attemptDirectory, "xdg-data"); const cache = path.join(attemptDirectory, "xdg-cache");
  for (const directory of [isolatedHome, isolatedTmp, data, cache]) fs.mkdirSync(directory, { mode: 0o700 });
  const pluginFile = boundProviderPluginFile(attemptDirectory, configuration, credential);
  const effectiveOverlay = { ...OVERLAY, plugin: [pathToFileURL(pluginFile).href] };
  return Object.freeze({ PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: isolatedHome, TMPDIR: isolatedTmp,
    LANG: "C", LC_ALL: "C", TZ: "UTC", XDG_DATA_HOME: data, XDG_CACHE_HOME: cache,
    OPENCODE_AUTO_SHARE: "false", OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_CLAUDE_CODE: "true",
    OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "true", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "true",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "false", OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "true", OPENCODE_ENABLE_EXA: "false",
    OPENCODE_CONFIG_DIR: configuration, OPENCODE_CONFIG_CONTENT: JSON.stringify(effectiveOverlay),
    OPENCODE_AUTH_CONTENT: credential.placeholder_auth_content,
    CORE_PUBLIC_AB_PROVIDER_PROXY_FILE: credential.credential_file });
}
function providerExecutionBinding(attemptDirectory, configuration, credential) {
  const configurationFingerprint = providerConfigurationBaseline(attemptDirectory, configuration, credential);
  const environment = modelEnvironment(attemptDirectory, configuration, credential);
  expect(configurationFingerprint === directoryFingerprint(configuration),
    "MEASUREMENT_CONFIGURATION_DRIFT", "provider environment construction changed the frozen configuration");
  return Object.freeze({ configuration_fingerprint: configurationFingerprint, environment });
}

function installProviderBridgeFiles({ attemptDirectory, configuration, proxy }) {
  const credentialFile = path.join(attemptDirectory, "host-credential.json");
  fs.writeFileSync(credentialFile, JSON.stringify(proxy.payload), { encoding: "utf8", flag: "wx", mode: 0o600 });
  const plugins = path.join(configuration, "plugins"); fs.mkdirSync(plugins, { recursive: true, mode: 0o700 });
  const plugin = path.join(plugins, "core-public-ab-provider-proxy.mjs");
  fs.writeFileSync(plugin, PROVIDER_PROXY_PLUGIN, { encoding: "utf8", flag: "wx", mode: 0o400 });
  return Object.freeze({ credential_file: credentialFile, plugin_file: plugin,
    provider_proxy_socket: proxy.socket_path,
    placeholder_auth_content: JSON.stringify({ openai: { type: "api", key: "core-public-ab-host-provider-proxy" } }),
    status() { return proxy.status(); }, async close() { await proxy.close(); } });
}

async function installCredentialBridge({ attemptDirectory, configuration, credentialStore }) {
  let proxy = null;
  try {
    proxy = await createProviderProxy(credentialStore,
      `/private/tmp/core-ab-${process.pid}-${randomBytes(12).toString("base64url")}.sock`);
    return installProviderBridgeFiles({ attemptDirectory, configuration, proxy });
  } catch (error) {
    await proxy?.close(); throw error;
  }
}

async function executeAcceptanceArm({ arm, coreBundle, opencode, trustedNodePath }) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), `core-public-ab-acceptance-${arm}-`));
  let bridge = null;
  try {
    const workspace = path.join(root, "workspace"); const attemptDirectory = path.join(root, "attempt");
    const configuration = path.join(attemptDirectory, "configuration");
    fs.mkdirSync(workspace, { recursive: true, mode: 0o700 }); fs.mkdirSync(attemptDirectory, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(workspace, "probe.js"), "export default true;\n", { mode: 0o600 });
    expect(passed(run("git", ["init", "--quiet"], { cwd: workspace }))
      && passed(run("git", ["add", "."], { cwd: workspace })),
    "MEASUREMENT_ACCEPTANCE", `${arm} acceptance workspace initialization failed`);
    const task = Object.freeze({ allowed_mutation_paths: ["probe.js"], subject_paths: ["probe.js"] });
    const before = captureWorkspace(workspace);
    const catalogBefore = arm === "core" ? await installCatalog(workspace, task, coreBundle, trustedNodePath) : null;
    copyConfiguration(arm === "core" ? coreBundle : null, configuration);
    const proxy = await createSyntheticAcceptanceProxy(
      `/private/tmp/core-ab-${process.pid}-${randomBytes(12).toString("base64url")}.sock`);
    bridge = installProviderBridgeFiles({ attemptDirectory, configuration, proxy });
    const providerBinding = providerExecutionBinding(attemptDirectory, configuration, bridge);
    const configurationBefore = providerBinding.configuration_fingerprint;
    const profile = path.join(attemptDirectory, "model.sb");
    fs.writeFileSync(profile, modelSandboxProfile({ workspace, attemptDirectory, opencodePath: opencode.path,
      providerProxySocket: bridge.provider_proxy_socket, trustedNodePath }), { mode: 0o600 });
    const opencodeArgs = ["run", "--format", "json", "--model", `${MODEL_BINDING.provider}/${MODEL_BINDING.model}`,
      "--variant", MODEL_BINDING.variant, "--agent", arm === "core" ? "core" : "build", "--dir", workspace,
      ACCEPTANCE_PROMPT];
    const file = arm === "core" ? process.execPath : opencode.path;
    const args = arm === "core" ? [path.join(configuration, "runtime", "opencode-core.mjs"), "--workspace", workspace,
      "--opencode", opencode.path, "--receipt-fd", "3", "--child-timeout-ms", "120000", "--", ...opencodeArgs]
      : opencodeArgs;
    const managed = await runManagedProcess({ file, args, cwd: workspace,
      env: providerBinding.environment, profile, timeoutMs: 120_000,
      candidate: arm === "core" });
    await bridge.close(); const proxyEvidence = bridge.status(); bridge = null;
    const events = parseOpenCodeEvents(managed.stdout);
    const activation = arm === "core" ? parseActivation(managed.activation, catalogBefore) : null;
    const coreAcceptanceReceiptAuthentic = arm === "core"
      ? noMutationAcceptanceReceiptAuthentic(activation, catalogBefore)
      : null;
    const changed = changedPaths(before, captureWorkspace(workspace));
    const configurationDrift = configurationBefore !== directoryFingerprint(configuration);
    const catalogDrift = arm === "core"
      && catalogBefore.sha256 !== sha256File(path.join(workspace, ".git", "opencode-harness", "core", "checks.json"));
    expect(managed.status === 0 && managed.signal === null && managed.timed_out === false
      && managed.teardown_verified === true && events.protocol_valid === true
      && proxyEvidence.accepted_request_count === 1 && proxyEvidence.synthetic_response_count === 1
      && proxyEvidence.provider_submission_count === 0 && changed.length === 0
      && configurationDrift === false && catalogDrift === false
      && events.final_text_sha256 === sha256Bytes(Buffer.from(ACCEPTANCE_TEXT, "utf8"))
      && (arm !== "core" || coreAcceptanceReceiptAuthentic === true),
    "MEASUREMENT_ACCEPTANCE", `${arm} full OpenCode acceptance path failed`);
    return Object.freeze({ arm, status: "passed", full_opencode_run: true,
      provider_proxy_requests: proxyEvidence.accepted_request_count, provider_submissions: 0, model_calls: 0,
      process_containment_intact: true, no_surviving_descendants: true,
      core_verification_receipt_authentic: coreAcceptanceReceiptAuthentic,
      core_terminal_reason: arm === "core" ? activation.receipt.decision.reason : null,
      output_text_sha256: events.final_text_sha256,
      stdout_sha256: sha256Bytes(Buffer.from(managed.stdout, "utf8")),
      stderr_sha256: sha256Bytes(Buffer.from(managed.stderr, "utf8")) });
  } finally {
    await bridge?.close(); fs.rmSync(root, { recursive: true, force: true });
  }
}

async function runAcceptanceProbes(options) {
  assertClean(SOURCE_ROOT);
  const frozen = validateMeasurementManifest(options.manifest);
  const coreBundle = statDirectory(options.coreBundle, "core bundle");
  const bundleManifest = readJson(path.join(coreBundle, ".opencode-profile-manifest.json"), "core bundle manifest");
  expect(bundleManifest.source_sha === PRODUCT_SOURCE_SHA && bundleManifest.bundle_fingerprint === CORE_BUNDLE_FINGERPRINT
    && bundleManifest.source_tree_fingerprint === frozen.manifest.product_tree_fingerprint,
    "MEASUREMENT_ACCEPTANCE", "acceptance core bundle differs from frozen candidate");
  const opencode = verifyBenchmarkV3OpenCodeExecutable(path.resolve(options.opencode));
  expect(opencode.sha256 === frozen.manifest.opencode_executable_sha256 && opencode.version === frozen.manifest.opencode_version
    && opencode.executable_fingerprint === frozen.manifest.opencode_executable_fingerprint,
    "MEASUREMENT_ACCEPTANCE", "acceptance OpenCode executable differs from manifest");
  const trustedRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-acceptance-node-"));
  try {
    const trustedNodePath = prepareTrustedMeasurementNode(trustedRoot, {
      measurement_node_version: frozen.manifest.measurement_node_version,
      measurement_node_executable_sha256: frozen.manifest.measurement_node_executable_sha256,
    });
    const arms = [];
    for (const arm of ARMS) arms.push(await executeAcceptanceArm({ arm, coreBundle, opencode, trustedNodePath }));
    const body = { schema_version: 1, measurement_id: frozen.manifest.measurement_id,
      manifest_fingerprint: frozen.manifest.manifest_fingerprint, runner_sha256: sha256File(RUNNER_PATH),
      opencode_executable_sha256: opencode.sha256, core_bundle_fingerprint: CORE_BUNDLE_FINGERPRINT,
      probe_mode: "deterministic-local-proxy-no-external-submission", model_calls: 0, provider_calls: 0,
      arms, created_at: new Date().toISOString() };
    const receipt = Object.freeze({ ...body, acceptance_receipt_fingerprint: fingerprint(body) });
    durableJson(path.resolve(options.acceptanceOutput), receipt);
    return Object.freeze({ status: "passed", acceptance_receipt_fingerprint: receipt.acceptance_receipt_fingerprint,
      model_calls: 0, provider_calls: 0 });
  } finally { fs.rmSync(trustedRoot, { recursive: true, force: true }); }
}

function validateAcceptanceReceipt(file, manifest) {
  const receiptFile = statRegular(file, "acceptance receipt");
  const receipt = validateFingerprint(readJson(receiptFile.path, "acceptance receipt"),
    "acceptance_receipt_fingerprint", "acceptance receipt");
  expect(receipt.schema_version === 1 && receipt.measurement_id === manifest.measurement_id
    && receipt.manifest_fingerprint === manifest.manifest_fingerprint
    && receipt.runner_sha256 === sha256File(RUNNER_PATH)
    && receipt.opencode_executable_sha256 === manifest.opencode_executable_sha256
    && receipt.core_bundle_fingerprint === manifest.core_bundle_fingerprint
    && receipt.probe_mode === "deterministic-local-proxy-no-external-submission"
    && receipt.model_calls === 0 && receipt.provider_calls === 0
    && Array.isArray(receipt.arms) && receipt.arms.length === 2
    && ARMS.every((arm) => receipt.arms.some((entry) => entry.arm === arm && entry.status === "passed"
      && entry.full_opencode_run === true && entry.provider_proxy_requests === 1
      && entry.provider_submissions === 0 && entry.model_calls === 0
      && entry.process_containment_intact === true && entry.no_surviving_descendants === true
      && entry.output_text_sha256 === manifest.acceptance_probe.expected_text_sha256
      && (arm !== "core" || (entry.core_verification_receipt_authentic === true
        && entry.core_terminal_reason === "no_workspace_mutation")))),
  "MEASUREMENT_ACCEPTANCE", "plain/core acceptance receipt is invalid or incomplete");
  return Object.freeze({ receipt, sha256: sha256File(receiptFile.path) });
}

function parseOpenCodeEvents(stdout) {
  let jsonEventCount = 0; let terminalEventCount = 0; let openSteps = 0; let turns = 0;
  let finalTextEligible = false; let protocolValid = true; let tokens = 0; let usageObserved = false;
  const textFragments = []; const toolStates = new Map();
  const known = new Set(["step_start", "step_finish", "tool_use", "text", "reasoning", "error"]);
  for (const line of stdout.split("\n")) {
    if (line.trim().length === 0) continue;
    let value; try { value = JSON.parse(line); } catch { protocolValid = false; continue; }
    if (!value || typeof value !== "object" || !known.has(value.type)) { protocolValid = false; continue; }
    jsonEventCount += 1;
    if (value.type === "error") protocolValid = false;
    if (value.type === "step_start") { openSteps += 1; turns += 1; }
    if (value.type === "step_finish") { if (openSteps < 1) protocolValid = false; else openSteps -= 1; }
    if (value.type === "tool_use") {
      const id = value.part?.id; const status = value.part?.state?.status?.toLowerCase();
      if (typeof id !== "string" || typeof status !== "string") protocolValid = false;
      else { const previous = toolStates.get(id); if (["completed", "error", "failed"].includes(previous)) protocolValid = false; toolStates.set(id, status); }
    }
    if (["step_start", "tool_use", "reasoning", "error"].includes(value.type)) finalTextEligible = false;
    if (value.type === "text") {
      if (typeof value.part?.text !== "string") protocolValid = false;
      else { textFragments.push(value.part.text); if (value.part.text.trim()) finalTextEligible = true; }
    }
    const usage = value.usage ?? value.part?.usage ?? value.data?.usage;
    const total = usage?.total_tokens ?? usage?.totalTokens;
    if (Number.isSafeInteger(total) && total >= 0) { tokens += total; usageObserved = true; }
  }
  terminalEventCount = finalTextEligible ? 1 : 0;
  const unfinished = [...toolStates.values()].filter((status) => !["completed", "error", "failed"].includes(status)).length;
  protocolValid &&= jsonEventCount > 0 && terminalEventCount === 1 && openSteps === 0 && unfinished === 0;
  return Object.freeze({ protocol_valid: protocolValid, json_event_count: jsonEventCount,
    terminal_event_count: terminalEventCount, open_step_count: openSteps, unfinished_tool_count: unfinished,
    final_text_sha256: sha256Bytes(Buffer.from(textFragments.join("").trim(), "utf8")),
    turn_count: turns, tool_call_count: toolStates.size, tokens: usageObserved ? tokens : "not_observable",
    usage_observed: usageObserved });
}
function classifyError(stderr) {
  const text = stderr.toLowerCase();
  if (/model.+(?:not found|unavailable|access|permission)|unknown model|does not have access/u.test(text)) return "model-access";
  if (/unauthorized|forbidden|oauth|credential|token.+expired|status 401|status 403/u.test(text)) return "model-access";
  if (/rate.?limit|status 429/u.test(text)) return "provider-infrastructure";
  if (/sandbox|operation not permitted|spawn|enoent|eacces/u.test(text)) return "host-infrastructure";
  return "model-protocol";
}
function provenPreProviderHostTermination({ providerSubmissionCount, signal, spawnErrorCode }) {
  return providerSubmissionCount === 0 && (signal !== null || spawnErrorCode !== null);
}
async function terminateAndVerifyProcessGroup(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(-pid, "SIGKILL"); } catch (error) { if (error?.code !== "ESRCH") return false; }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try { process.kill(-pid, 0); } catch (error) { if (error?.code === "ESRCH") return true; return false; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}
function runManagedProcess({ file, args, cwd, env, profile, timeoutMs, candidate }) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const stdio = candidate ? ["ignore", "pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"];
    const child = spawn("/usr/bin/sandbox-exec", ["-f", profile, file, ...args], { cwd, env, shell: false,
      windowsHide: true, detached: true, stdio });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let activation = Buffer.alloc(0); let spawnError = null; let timedOut = false;
    const append = (current, chunk, limit) => current.length >= limit ? current : Buffer.concat([current, chunk]).subarray(0, limit);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk, 32 * 1024 * 1024); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk, 4 * 1024 * 1024); });
    if (candidate) child.stdio[3].on("data", (chunk) => { activation = append(activation, chunk, 1024 * 1024); });
    child.once("error", (error) => { spawnError = error; });
    const timeout = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch {} }, timeoutMs);
    child.once("close", async (status, signal) => {
      clearTimeout(timeout);
      const teardownVerified = await terminateAndVerifyProcessGroup(child.pid);
      resolve(Object.freeze({ status: Number.isInteger(status) ? status : null, signal: signal ?? null,
        timed_out: timedOut, spawn_error_code: spawnError?.code ?? null,
        teardown_verified: teardownVerified,
        duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
        stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), activation: activation.toString("utf8") }));
    });
  });
}

function parseActivation(bytes, expected) {
  if (bytes.trim().length === 0) return Object.freeze({ authentic: false, verification_authentic: false,
    process_receipt_observable: false, passed: false, receipt: null });
  let receipt; try { receipt = JSON.parse(bytes); } catch { return Object.freeze({ authentic: false,
    verification_authentic: false, process_receipt_observable: false, passed: false, receipt: null }); }
  const child = receipt?.child_execution;
  const processReceiptObservable = child?.schema_version === 1 && (child.status === null || Number.isSafeInteger(child.status))
    && (child.signal === null || typeof child.signal === "string")
    && (child.error_code === null || typeof child.error_code === "string");
  const verificationAuthentic = receipt?.schema_version === 2 && receipt.catalog_fingerprint === expected.catalog_fingerprint
    && receipt.catalog_status === "loaded" && typeof receipt.decision?.allowed === "boolean"
    && typeof receipt.decision?.reason === "string" && typeof receipt.activation?.post_last_mutation_verification === "boolean"
    && processReceiptObservable
    && receipt.check?.command_fingerprint === expected.command_fingerprint;
  const passedActivation = verificationAuthentic && receipt.decision.allowed === true
    && receipt.decision.reason === "post_last_mutation_verification_passed"
    && receipt.activation.post_last_mutation_verification === true && receipt.check?.status === "passed";
  return Object.freeze({ authentic: verificationAuthentic, verification_authentic: verificationAuthentic,
    process_receipt_observable: processReceiptObservable, passed: passedActivation, receipt });
}

function noMutationAcceptanceReceiptAuthentic(activation, expected) {
  const receipt = activation?.receipt;
  return activation?.process_receipt_observable === true && receipt?.schema_version === 2
    && receipt.catalog_fingerprint === expected.catalog_fingerprint && receipt.catalog_status === "loaded"
    && receipt.decision?.allowed === true && receipt.decision.reason === "no_workspace_mutation"
    && receipt.decision.activation_eligible === false && receipt.decision.activated === false
    && receipt.activation?.eligible === false
    && receipt.activation?.post_last_mutation_verification === false
    && receipt.activation?.terminal_success_allowed === true && receipt.activation?.mutation_revision === 0
    && receipt.activation?.selected_check_id === null && receipt.activation?.terminal_reason === "no_workspace_mutation"
    && receipt.activation?.verification_started_count === 0 && receipt.activation?.verification_completed_count === 0
    && receipt.check === null;
}

function coreVerificationStatus(activation, { configurationDrift = false, catalogDrift = false } = {}) {
  if (activation?.verification_authentic !== true || activation?.process_receipt_observable !== true) return "unavailable";
  if (configurationDrift || catalogDrift) return "failed";
  if (activation.passed === true) return "passed";
  return /stale/iu.test(activation.receipt?.decision?.reason ?? "") ? "stale" : "failed";
}

function syntaxVerification(workspace, subjectPaths) {
  const results = [];
  for (const relative of subjectPaths) {
    const target = path.join(workspace, ...safeRelative(relative).split("/"));
    if (!fs.existsSync(target)) { results.push(false); continue; }
    results.push(passed(run(process.execPath, ["--check", target], { cwd: workspace, timeout: 30_000 })));
  }
  return results.every(Boolean);
}
function publicOracle(task, workspace, runtimeRoot, runtimeFingerprint) {
  const runtime = path.join(runtimeRoot, task.runtime_key);
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-oracle-"));
  try {
    stageFiles(workspace, task.hidden_test_files);
    const modules = path.join(runtime, "node_modules"); const link = path.join(workspace, "node_modules");
    expect(!fs.existsSync(link), "MEASUREMENT_ORACLE", "workspace contains node_modules before oracle");
    fs.symlinkSync(modules, link, "dir");
    const profile = path.join(temporary, "oracle.sb");
    fs.writeFileSync(profile, oracleSandboxProfile({ workspace, runtime, temporary }), { mode: 0o600 });
    const mocha = path.join(modules, "mocha", "bin", "mocha.js");
    const result = run("/usr/bin/sandbox-exec", ["-f", profile, process.execPath, mocha, "--reporter", "json", ...task.test_argv], {
      cwd: workspace, env: { PATH: process.env.PATH ?? "", HOME: temporary, TMPDIR: temporary, LANG: "C", LC_ALL: "C", NODE_ENV: "test" }, timeout: 120_000,
    });
    let report = null; try { report = JSON.parse(result.stdout); } catch { report = null; }
    const stats = report?.stats; const countAuthentic = Number.isSafeInteger(stats?.tests) && stats.tests > 0
      && stats.tests === task.expected_test_count && stats.passes + stats.failures + stats.pending === stats.tests;
    const semantic = passed(result) && countAuthentic && stats.passes === stats.tests && stats.failures === 0 && stats.pending === 0;
    return Object.freeze({ semantic_passed: semantic, test_count: countAuthentic ? stats.tests : null,
      oracle_timeout: result.error?.code === "ETIMEDOUT", runtime_fingerprint: runtimeFingerprint,
      result_fingerprint: fingerprint({ semantic, count: countAuthentic ? stats.tests : null, status: result.status, signal: result.signal ?? null }) });
  } finally {
    fs.rmSync(path.join(workspace, "node_modules"), { recursive: true, force: true });
    for (const hidden of task.hidden_test_files) fs.rmSync(path.join(workspace, ...safeRelative(hidden.path).split("/")), { force: true });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
function parseTapCount(stdout) {
  const tests = /^# tests ([0-9]+)$/mu.exec(stdout); const passCount = /^# pass ([0-9]+)$/mu.exec(stdout); const failCount = /^# fail ([0-9]+)$/mu.exec(stdout);
  return tests ? Object.freeze({ tests: Number(tests[1]), passes: Number(passCount?.[1] ?? 0), failures: Number(failCount?.[1] ?? 0), pending: 0 }) : null;
}
function pilotOracle(task, workspace, pilotRoot, runtimeEntry) {
  const runtime = path.join(pilotRoot, "sources", `${task.repository_id}-work`);
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-pilot-oracle-"));
  try {
    stageFiles(workspace, task.hidden_test_files);
    const modules = path.join(runtime, "node_modules"); const link = path.join(workspace, "node_modules");
    expect(!fs.existsSync(link), "MEASUREMENT_ORACLE", "pilot workspace contains node_modules before oracle");
    fs.symlinkSync(modules, link, "dir");
    const profile = path.join(temporary, "oracle.sb"); fs.writeFileSync(profile, oracleSandboxProfile({ workspace, runtime, temporary }), { mode: 0o600 });
    const adapter = PILOT_ADAPTERS[task.repository_id];
    const args = adapter.kind === "node-test"
      ? ["-f", profile, process.execPath, ...adapter.prefix_args, "--test-reporter=tap", ...task.test_paths]
      : adapter.kind === "vitest"
        ? ["-f", profile, process.execPath, path.join(runtime, adapter.entry), ...adapter.prefix_args, "--reporter=json", ...task.test_paths]
        : ["-f", profile, process.execPath, path.join(runtime, adapter.entry), ...adapter.prefix_args, "--reporter", "json", ...task.test_paths];
    const result = run("/usr/bin/sandbox-exec", args, { cwd: workspace,
      env: { PATH: process.env.PATH ?? "", HOME: temporary, TMPDIR: temporary, LANG: "C", LC_ALL: "C", NODE_ENV: "test" }, timeout: 30_000 });
    let stats = null;
    if (adapter.kind === "node-test") stats = parseTapCount(result.stdout);
    else {
      let report = null; try { report = JSON.parse(result.stdout); } catch { report = null; }
      if (adapter.kind === "vitest") stats = report ? { tests: report.numTotalTests, passes: report.numPassedTests,
        failures: report.numFailedTests, pending: report.numPendingTests ?? report.numTodoTests ?? 0 } : null;
      else stats = report?.stats ?? null;
    }
    const authentic = Number.isSafeInteger(stats?.tests) && stats.tests === task.expected_test_count
      && Number.isSafeInteger(stats.passes) && Number.isSafeInteger(stats.failures)
      && Number.isSafeInteger(stats.pending) && stats.passes + stats.failures + stats.pending === stats.tests;
    const semantic = passed(result) && authentic && stats.passes === stats.tests && stats.failures === 0 && stats.pending === 0;
    return Object.freeze({ semantic_passed: semantic, test_count: authentic ? stats.tests : null,
      oracle_timeout: result.error?.code === "ETIMEDOUT", runtime_fingerprint: runtimeEntry.installed_tree_fingerprint,
      result_fingerprint: fingerprint({ semantic, count: authentic ? stats.tests : null, status: result.status, signal: result.signal ?? null }) });
  } finally {
    fs.rmSync(path.join(workspace, "node_modules"), { recursive: true, force: true });
    for (const hidden of task.hidden_test_files) fs.rmSync(path.join(workspace, ...safeRelative(hidden.path).split("/")), { force: true });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function buildPublicTasks(corpus) {
  return corpus.families.map((family) => Object.freeze({ id: family.family_id, dataset: family.split,
    repository_id: "public-eslint", stratum: family.stratum,
    parent_commit: family.control_surface.provenance.parent_commit,
    before_files: family.public_surface.public_files,
    hidden_test_files: family.control_surface.hidden_test_files,
    allowed_mutation_paths: family.control_surface.allowed_mutation_paths,
    subject_paths: family.public_surface.public_files.map((entry) => entry.path),
    test_argv: family.control_surface.test_argv, expected_test_count: family.control_surface.expected_test_count,
    runtime_key: family.control_surface.runtime_key, severity: family.control_surface.defect_severity,
    prompt: family.public_surface.visible_requirements.join("\n\n"),
    public_surface_fingerprint: family.manifest.public_surface_fingerprint }));
}
function buildPilotTasks(pilotManifest, artifact, repositories) {
  const identities = new Map(artifact.payload.independent_pool.map((identity) => [identity.identity_id, identity]));
  return pilotManifest.tasks.map((binding) => {
    const identity = identities.get(binding.identity_id);
    expect(identity !== undefined, "MEASUREMENT_PILOT", `${binding.identity_id} is absent from artifact`);
    const prompt = pilotPrompt(repositories[identity.repository_id], identity);
    expect(sha256Bytes(Buffer.from(prompt, "utf8")) === binding.prompt_sha256,
      "MEASUREMENT_PILOT", `${binding.identity_id} prompt differs from pilot manifest`);
    return Object.freeze({ id: identity.identity_id, dataset: "pilot", repository_id: identity.repository_id,
      stratum: identity.stratum, parent_commit: identity.parent_commit, before_files: identity.before_files,
      hidden_test_files: identity.hidden_test_files, allowed_mutation_paths: identity.source_paths,
      subject_paths: identity.source_paths, test_paths: identity.test_paths, expected_test_count: identity.expected_test_count,
      severity: "unclassified", prompt, public_surface_fingerprint: binding.task_binding_fingerprint });
  });
}

function loadLedger(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, "utf8"); expect(text.endsWith("\n"), "MEASUREMENT_LEDGER", "ledger is not newline terminated");
  const records = text.trimEnd().split("\n").map((line) => JSON.parse(line));
  let previous = null;
  records.forEach((record, index) => {
    const { event_hash: declared, ...body } = record;
    expect(record.sequence === index + 1 && record.previous_hash === previous && declared === fingerprint(body),
      "MEASUREMENT_LEDGER", "ledger hash chain is invalid");
    previous = declared;
  });
  return records;
}
function ledgerAppender(file) {
  let records = loadLedger(file); let previous = records.at(-1)?.event_hash ?? null;
  return Object.freeze({ records: () => records.slice(), append(event) {
    const body = { schema_version: 1, sequence: records.length + 1, previous_hash: previous, ...event };
    const record = Object.freeze({ ...body, event_hash: fingerprint(body) }); appendDurableLine(file, record);
    records = [...records, record]; previous = record.event_hash; return record;
  } });
}
function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== "ESRCH"; }
}
function acquireCampaignLease(campaignRoot, manifestFingerprint) {
  fs.mkdirSync(campaignRoot, { recursive: true, mode: 0o700 });
  const leasePath = path.join(campaignRoot, "campaign-run.lock");
  const nonce = randomBytes(32).toString("base64url");
  const value = Object.freeze({ schema_version: 1, hostname: os.hostname(), pid: process.pid, nonce,
    manifest_fingerprint: manifestFingerprint, acquired_at: new Date().toISOString() });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const descriptor = fs.openSync(leasePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
      try { fs.writeFileSync(descriptor, `${JSON.stringify(value)}\n`); fs.fsyncSync(descriptor); }
      finally { fs.closeSync(descriptor); }
      const parent = fs.openSync(campaignRoot, fs.constants.O_RDONLY); try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
      return Object.freeze({ async close() {
        let current; try { current = readJson(leasePath, "campaign lease"); } catch {
          fail("MEASUREMENT_CAMPAIGN_LEASE", "campaign lease disappeared or became invalid");
        }
        expect(current.nonce === nonce && current.pid === process.pid && current.hostname === os.hostname(),
          "MEASUREMENT_CAMPAIGN_LEASE", "campaign lease ownership changed");
        fs.unlinkSync(leasePath);
        const directory = fs.openSync(campaignRoot, fs.constants.O_RDONLY);
        try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      } });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let current; try { current = readJson(leasePath, "campaign lease"); }
      catch { fail("MEASUREMENT_CAMPAIGN_BUSY", "campaign lease is invalid and requires operator reconciliation"); }
      if (current?.hostname !== os.hostname()) {
        fail("MEASUREMENT_CAMPAIGN_BUSY", "campaign is leased on another host and cannot be proven stale");
      }
      if (Number.isSafeInteger(current.pid) && current.pid > 0 && processAlive(current.pid)) {
        fail("MEASUREMENT_CAMPAIGN_BUSY", `campaign is already running under pid ${current.pid}`);
      }
      const stale = path.join(campaignRoot, `campaign-run.stale-${fingerprint(current).slice(7, 23)}.json`);
      try { fs.renameSync(leasePath, stale); } catch (renameError) { if (renameError?.code !== "ENOENT") throw renameError; }
    }
  }
  fail("MEASUREMENT_CAMPAIGN_BUSY", "campaign lease could not be acquired without a race");
}

function attemptIdentifier(dataset, identityId, arm, attemptIndex) {
  return `${dataset}-${identityId.replace(/[^A-Za-z0-9._-]+/gu, "-")}-${arm}-${attemptIndex}`;
}
function expectedAttemptBinding(manifest, pilotManifest, { dataset, identityId, arm, attemptIndex, retryOf }) {
  const taskFingerprint = manifest.task_binding_fingerprints?.[dataset]?.[identityId];
  expect(FP.test(taskFingerprint ?? ""), "MEASUREMENT_BINDING", `${dataset}/${identityId} task binding is absent`);
  return fingerprint({ schema_version: 1, manifest_fingerprint: manifest.manifest_fingerprint,
    pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint, dataset, identity_id: identityId,
    arm, attempt_index: attemptIndex, retry_of: retryOf, task_fingerprint: taskFingerprint });
}
function receiptPath(campaignRoot, dataset, identityId, arm, attemptIndex) {
  return path.join(campaignRoot, "receipts", dataset, identityId.replace(/[^A-Za-z0-9._-]+/gu, "-"),
    `${arm}-attempt-${attemptIndex}.json`);
}
function validateOutcomeReceipt(value, file, { manifest, pilotManifest, dataset, identityId, arm }) {
  expect(value?.schema_version === 1 && value.dataset === dataset && value.identity_id === identityId && value.arm === arm
    && typeof value.oracle_validated_task_success === "boolean"
    && !Object.hasOwn(value, "regression_free_task_success") && !Object.hasOwn(value, "severity")
    && typeof value.reconciliation_required === "boolean"
    && (arm !== "core" || ["passed", "failed", "stale", "unavailable"].includes(value.core_verification_status))
    && (value.scored_outcome !== true || (typeof value.authentic_terminal_completion === "boolean"
      && typeof value.timed_out === "boolean" && typeof value.process_containment_intact === "boolean"
      && value.no_surviving_descendants === true
      && typeof value.mutation_scope_valid === "boolean" && typeof value.syntax_verification_success === "boolean"
      && typeof value.no_change === "boolean"
      && typeof value.task_specific_semantic_oracle_passed === "boolean"
      && value.hidden_data_leakage_observed === false && FP.test(value.hidden_data_preflight_fingerprint ?? "")))
    && Number.isSafeInteger(value.attempt_index) && value.attempt_index >= 1 && value.attempt_index <= 2
    && value.attempt_id === attemptIdentifier(dataset, identityId, arm, value.attempt_index)
    && value.attempt_binding_fingerprint === expectedAttemptBinding(manifest, pilotManifest, { dataset, identityId, arm,
      attemptIndex: value.attempt_index, retryOf: value.retry_of_attempt_id ?? null })
    && FP.test(value.outcome_fingerprint ?? "") && value.outcome_fingerprint === bodyFingerprint(value, "outcome_fingerprint"),
  "MEASUREMENT_RECEIPT", `${dataset}/${identityId}/${arm} receipt binding is invalid`);
  return Object.freeze({ value, file: path.resolve(file), sha256: sha256File(file) });
}

async function executeAttempt(context, task, arm, attemptIndex, retryOf = null) {
  const attemptId = attemptIdentifier(task.dataset, task.id, arm, attemptIndex);
  const modelStarts = context.ledger.records().filter((record) => record.event_type === "model-process-started").length;
  const retryStarts = context.ledger.records().filter((record) => record.event_type === "attempt-started"
    && record.attempt_index > 1).length;
  expect(modelStarts < MAXIMUM_MODEL_CALLS, "MEASUREMENT_MODEL_CALL_BUDGET", "hard maximum of 196 model calls is exhausted");
  if (attemptIndex > 1) expect(retryStarts < MAXIMUM_INFRASTRUCTURE_RETRIES,
    "MEASUREMENT_MODEL_CALL_BUDGET", "campaign maximum of 18 infrastructure retries is exhausted");
  expect(task.public_surface_fingerprint === context.manifest.task_binding_fingerprints?.[task.dataset]?.[task.id],
    "MEASUREMENT_BINDING", `${task.id} runtime task binding differs from manifest`);
  const attemptBinding = expectedAttemptBinding(context.manifest, context.pilotManifest, { dataset: task.dataset,
    identityId: task.id, arm, attemptIndex, retryOf });
  context.ledger.append({ event_type: "attempt-started", attempt_id: attemptId, retry_of_attempt_id: retryOf,
    dataset: task.dataset, identity_id: task.id, stratum: task.stratum, arm, attempt_index: attemptIndex,
    attempt_binding_fingerprint: attemptBinding, recorded_at: new Date().toISOString() });
  let workspace = null; let attemptDirectory = null; let credential = null; let modelProcessStarted = false;
  let terminalOutcomeRecorded = false;
  try {
    workspace = materializeTaskWorkspace(task, context.repositories);
    const hiddenDataPreflight = observeHiddenDataExposure(task, workspace);
    expect(hiddenDataPreflight.leakage_observed === false, "MEASUREMENT_HIDDEN_DATA_LEAKAGE",
      `${attemptId} hidden control bytes or paths entered model-visible inputs`);
    const before = captureWorkspace(workspace);
    const catalogBefore = arm === "core" ? await installCatalog(workspace, task, context.coreBundle,
      context.trustedNodePath) : null;
    attemptDirectory = fs.mkdtempSync(path.join(context.campaignRoot, "attempt-private-"));
    const configuration = path.join(attemptDirectory, "configuration");
    copyConfiguration(arm === "core" ? context.coreBundle : null, configuration);
    credential = await installCredentialBridge({ attemptDirectory, configuration,
      credentialStore: context.credentialStore });
    const providerBinding = providerExecutionBinding(attemptDirectory, configuration, credential);
    const configurationBefore = providerBinding.configuration_fingerprint;
    const profile = path.join(attemptDirectory, "model.sb");
    fs.writeFileSync(profile, modelSandboxProfile({ workspace, attemptDirectory, opencodePath: context.opencode.path,
      providerProxySocket: credential.provider_proxy_socket, trustedNodePath: context.trustedNodePath }), { mode: 0o600 });
    const opencodeArgs = ["run", "--format", "json", "--model", `${MODEL_BINDING.provider}/${MODEL_BINDING.model}`,
      "--variant", MODEL_BINDING.variant, "--agent", arm === "core" ? "core" : "build", "--dir", workspace, task.prompt];
    const file = arm === "core" ? process.execPath : context.opencode.path;
    const args = arm === "core" ? [path.join(configuration, "runtime", "opencode-core.mjs"), "--workspace", workspace,
      "--opencode", context.opencode.path, "--receipt-fd", "3", "--child-timeout-ms", String(context.manifest.timeout_ms), "--", ...opencodeArgs] : opencodeArgs;
    expect(context.ledger.records().filter((record) => record.event_type === "model-process-started").length < MAXIMUM_MODEL_CALLS,
      "MEASUREMENT_MODEL_CALL_BUDGET", "hard maximum of 196 model calls is exhausted");
    context.ledger.append({ event_type: "model-process-started", attempt_id: attemptId,
      attempt_binding_fingerprint: attemptBinding, recorded_at: new Date().toISOString() });
    modelProcessStarted = true;
    const managed = await runManagedProcess({ file, args, cwd: workspace,
      env: providerBinding.environment, profile,
      timeoutMs: context.manifest.timeout_ms,
      candidate: arm === "core" });
    await credential.close(); const providerEvidence = credential.status(); credential = null;
    expect(managed.teardown_verified === true, "MEASUREMENT_RECONCILIATION_REQUIRED",
      `${attemptId} model process tree teardown is unverified; hidden oracle remains sealed`);
    const events = parseOpenCodeEvents(managed.stdout);
    const activation = arm === "core" ? parseActivation(managed.activation, catalogBefore) : null;
    const child = arm === "core" && activation?.process_receipt_observable === true
      ? activation.receipt.child_execution
      : arm === "plain"
        ? { status: managed.status, signal: managed.signal, error_code: managed.spawn_error_code }
        : { status: null, signal: null, error_code: "UNOBSERVABLE_PROCESS_RECEIPT" };
    const ordinaryCompletion = managed.timed_out === false && child?.signal === null && child?.error_code === null
      && child?.status === 0;
    const after = captureWorkspace(workspace); const changed = changedPaths(before, after);
    const violations = changed.filter((entry) => !task.allowed_mutation_paths.includes(entry));
    const syntaxPassed = syntaxVerification(workspace, task.subject_paths);
    const configurationAfter = directoryFingerprint(configuration);
    const catalogAfter = arm === "core" ? sha256File(path.join(workspace, ".git", "opencode-harness", "core", "checks.json")) : null;
    const configurationDrift = configurationBefore !== configurationAfter;
    const catalogDrift = arm === "core" && catalogBefore.sha256 !== catalogAfter;
    workspace = isolateHiddenOracleWorkspace(workspace);
    const oracle = task.dataset === "pilot"
      ? pilotOracle(task, workspace, context.pilotRoot, context.pilotRuntimeByRepository.get(task.repository_id))
      : publicOracle(task, workspace, context.publicRuntime.root,
        context.publicRuntime.runtime.entries.find((entry) => entry.key === task.runtime_key)?.key_fingerprint ?? "missing");
    const coreVerificationBlocked = arm === "core" && (!activation?.verification_authentic || !activation.passed || catalogDrift || configurationDrift);
    const verificationStatus = arm === "core" ? coreVerificationStatus(activation, { configurationDrift, catalogDrift }) : null;
    const timedOut = managed.timed_out || child?.error_code === "ETIMEDOUT" || oracle.oracle_timeout;
    const authenticTerminalCompletion = ordinaryCompletion && events.json_event_count > 0 && events.protocol_valid;
    const hostEnvironmentIntegrity = !configurationDrift && !catalogDrift;
    const processContainmentIntact = managed.teardown_verified === true && hostEnvironmentIntegrity;
    const errorClass = authenticTerminalCompletion ? null : classifyError(`${managed.stderr}\n${managed.stdout}\n${managed.activation}`);
    const providerAccessFailure = providerEvidence.provider_response_statuses.some((status) => status === 401 || status === 403);
    const providerRejectedBeforeExecution = providerEvidence.provider_response_statuses.some((status) => status === 429);
    const modelAccessRequired = errorClass === "model-access" || providerAccessFailure;
    if (providerEvidence.ambiguous_submission_count > 0 && !timedOut) {
      fail("MEASUREMENT_RECONCILIATION_REQUIRED",
        `${attemptId} has an ambiguous provider submission after the model boundary; retry is forbidden`);
    }
    const providerSubmissionDispositionEstablished = providerEvidence.ambiguous_submission_count === 0;
    const preProviderHostTermination = provenPreProviderHostTermination({
      providerSubmissionCount: providerEvidence.provider_submission_count,
      signal: managed.signal,
      spawnErrorCode: managed.spawn_error_code,
    });
    const explicitInfrastructureFailure = (arm === "core" && activation?.process_receipt_observable !== true)
      || (!timedOut && changed.length === 0 && !oracle.semantic_passed
      && !authenticTerminalCompletion && !configurationDrift && !catalogDrift
      && providerEvidence.ambiguous_submission_count === 0 && !modelAccessRequired
      && (preProviderHostTermination || providerRejectedBeforeExecution || (providerEvidence.provider_submission_count === 0
        && ["host-infrastructure", "provider-infrastructure"].includes(errorClass))));
    const classification = modelAccessRequired ? Object.freeze({ oracle_validated_task_success: false,
      scored_outcome: false, infrastructure_failure_before_scoring: false, reconciliation_required: false })
      : classifyAttemptSignals({ arm,
      process_receipt_observable: arm === "plain" || activation?.process_receipt_observable === true,
      authentic_terminal_completion: authenticTerminalCompletion,
      timed_out: timedOut,
      process_containment_intact: processContainmentIntact,
      no_surviving_descendants: managed.teardown_verified === true,
      mutation_scope_valid: violations.length === 0,
      syntax_verification_success: syntaxPassed,
      no_change: changed.length === 0,
      task_specific_semantic_oracle_passed: oracle.semantic_passed,
      hidden_data_leakage_observed: hiddenDataPreflight.leakage_observed,
      authentic_current_core_verification_passed: arm === "core" ? !coreVerificationBlocked : null,
      explicit_infrastructure_failure: explicitInfrastructureFailure,
      provider_submission_disposition_established: providerSubmissionDispositionEstablished,
    });
    const outcomeBody = { schema_version: 1, attempt_id: attemptId, retry_of_attempt_id: retryOf,
      attempt_binding_fingerprint: attemptBinding, dataset: task.dataset, identity_id: task.id, stratum: task.stratum,
      arm, attempt_index: attemptIndex,
      oracle_validated_task_success: classification.oracle_validated_task_success,
      task_specific_semantic_oracle_passed: oracle.semantic_passed, syntax_verification_success: syntaxPassed,
      mutation_scope_valid: violations.length === 0, scope_violations: violations, changed_paths: changed,
      timed_out: timedOut, no_change: changed.length === 0, authentic_terminal_completion: authenticTerminalCompletion,
      process_containment_intact: processContainmentIntact,
      no_surviving_descendants: managed.teardown_verified === true,
      hidden_data_leakage_observed: hiddenDataPreflight.leakage_observed,
      hidden_data_preflight_fingerprint: hiddenDataPreflight.preflight_fingerprint,
      model_protocol_valid: events.protocol_valid, core_activation: arm === "core" ? activation?.passed === true : null,
      core_verification_blocked: coreVerificationBlocked,
      core_verification_receipt_authentic: arm === "core" ? activation?.verification_authentic === true : null,
      core_verification_status: verificationStatus,
      process_receipt_observable: arm === "plain" || activation?.process_receipt_observable === true,
      configuration_drift: configurationDrift, catalog_drift: catalogDrift,
      process_status: child?.status ?? managed.status, process_signal: child?.signal ?? managed.signal,
      infrastructure_failure_before_scoring: classification.infrastructure_failure_before_scoring,
      provider_submission_disposition_established: providerSubmissionDispositionEstablished,
      reconciliation_required: classification.reconciliation_required,
      model_access_required: modelAccessRequired, scored_outcome: classification.scored_outcome,
      error_class: errorClass, duration_ms: managed.duration_ms, turn_count: events.turn_count,
      tool_call_count: events.tool_call_count, tokens: events.tokens, usage_observed: events.usage_observed,
      provider_evidence: providerEvidence,
      stdout_sha256: sha256Bytes(Buffer.from(managed.stdout, "utf8")), stderr_sha256: sha256Bytes(Buffer.from(managed.stderr, "utf8")),
      stdout_bytes: Buffer.byteLength(managed.stdout), stderr_bytes: Buffer.byteLength(managed.stderr),
      oracle_result_fingerprint: oracle.result_fingerprint,
      recorded_at: new Date().toISOString() };
    const outcome = Object.freeze({ ...outcomeBody, outcome_fingerprint: fingerprint(outcomeBody) });
    const targetReceipt = receiptPath(context.campaignRoot, task.dataset, task.id, arm, attemptIndex);
    durableJson(targetReceipt, outcome);
    context.ledger.append({ event_type: "attempt-completed", attempt_id: attemptId, retry_of_attempt_id: retryOf,
      dataset: task.dataset, identity_id: task.id, stratum: task.stratum, arm, attempt_index: attemptIndex,
      attempt_binding_fingerprint: attemptBinding, outcome_fingerprint: outcome.outcome_fingerprint,
      receipt_sha256: sha256File(targetReceipt), scored_outcome: outcome.scored_outcome,
      infrastructure_failure_before_scoring: outcome.infrastructure_failure_before_scoring,
      model_access_required: outcome.model_access_required,
      reconciliation_required: outcome.reconciliation_required, recorded_at: outcome.recorded_at });
    terminalOutcomeRecorded = true;
    if (classification.reconciliation_required) {
      context.ledger.append({ event_type: "attempt-reconciliation-required", attempt_id: attemptId,
        attempt_binding_fingerprint: attemptBinding, reason_code: "ambiguous-provider-submission-after-scored-timeout",
        scored_outcome: true, recorded_at: new Date().toISOString() });
      fail("MEASUREMENT_RECONCILIATION_REQUIRED",
        `${attemptId} timeout is scored but provider submission disposition remains reconciliation-owned`);
    }
    return outcome;
  } catch (error) {
    if (terminalOutcomeRecorded) throw error;
    if (!modelProcessStarted && error?.code === "MEASUREMENT_HIDDEN_DATA_LEAKAGE") {
      context.ledger.append({ event_type: "attempt-critical-runner-defect", attempt_id: attemptId,
        attempt_binding_fingerprint: attemptBinding, reason_code: error.code, recorded_at: new Date().toISOString() });
      throw error;
    }
    if (modelProcessStarted) {
      context.ledger.append({ event_type: "attempt-reconciliation-required", attempt_id: attemptId,
        attempt_binding_fingerprint: attemptBinding, reason_code: error?.code ?? "unclassified-after-model-process-start",
        recorded_at: new Date().toISOString() });
      if (error?.code === "MODEL_ACCESS_REQUIRED") throw error;
      fail("MEASUREMENT_RECONCILIATION_REQUIRED",
        `${attemptId} failed after model process start; retry is forbidden because provider submission is ambiguous`);
    }
    const modelAccessRequired = error?.code === "MODEL_ACCESS_REQUIRED"
      || classifyError(error?.stack ?? error?.message ?? String(error)) === "model-access";
    const outcomeBody = { schema_version: 1, attempt_id: attemptId, retry_of_attempt_id: retryOf,
      attempt_binding_fingerprint: attemptBinding, dataset: task.dataset, identity_id: task.id, stratum: task.stratum,
      arm, attempt_index: attemptIndex, oracle_validated_task_success: false,
      task_specific_semantic_oracle_passed: false, syntax_verification_success: false, mutation_scope_valid: true,
      scope_violations: [], changed_paths: [], timed_out: false, no_change: true,
      authentic_terminal_completion: false, process_containment_intact: true, no_surviving_descendants: true,
      hidden_data_leakage_observed: null, hidden_data_preflight_fingerprint: null,
      model_protocol_valid: false, core_activation: null,
      core_verification_blocked: false, core_verification_receipt_authentic: null, process_receipt_observable: false,
      core_verification_status: arm === "core" ? "unavailable" : null,
      configuration_drift: false, catalog_drift: false, process_status: null, process_signal: null,
      infrastructure_failure_before_scoring: !modelAccessRequired, model_access_required: modelAccessRequired,
      provider_submission_disposition_established: true,
      reconciliation_required: false,
      scored_outcome: false, error_class: modelAccessRequired ? "model-access" : "host-infrastructure",
      duration_ms: 0, turn_count: 0, tool_call_count: 0, tokens: "not_observable", usage_observed: false,
      stdout_sha256: sha256Bytes(Buffer.alloc(0)), stderr_sha256: sha256Bytes(Buffer.from(error?.message ?? String(error), "utf8")),
      stdout_bytes: 0, stderr_bytes: Buffer.byteLength(error?.message ?? String(error)), oracle_result_fingerprint: null,
      recorded_at: new Date().toISOString() };
    const outcome = Object.freeze({ ...outcomeBody, outcome_fingerprint: fingerprint(outcomeBody) });
    const targetReceipt = receiptPath(context.campaignRoot, task.dataset, task.id, arm, attemptIndex);
    durableJson(targetReceipt, outcome);
    context.ledger.append({ event_type: "attempt-completed", attempt_id: attemptId, retry_of_attempt_id: retryOf,
      dataset: task.dataset, identity_id: task.id, stratum: task.stratum, arm, attempt_index: attemptIndex,
      attempt_binding_fingerprint: attemptBinding, outcome_fingerprint: outcome.outcome_fingerprint,
      receipt_sha256: sha256File(targetReceipt), scored_outcome: false,
      infrastructure_failure_before_scoring: outcome.infrastructure_failure_before_scoring,
      model_access_required: outcome.model_access_required,
      reconciliation_required: outcome.reconciliation_required, recorded_at: outcome.recorded_at });
    return outcome;
  } finally {
    await credential?.close();
    if (attemptDirectory !== null) fs.rmSync(attemptDirectory, { recursive: true, force: true });
    if (workspace !== null) fs.rmSync(workspace, { recursive: true, force: true });
  }
}

function ledgerRecordRequiresReconciliation(record) {
  return ["attempt-reconciliation-required", "attempt-critical-runner-defect"].includes(record.event_type)
    || (record.event_type === "attempt-completed" && record.reconciliation_required === true);
}

function completedOutcomes(context, task, arm) {
  const directory = path.join(context.campaignRoot, "receipts", task.dataset,
    task.id.replace(/[^A-Za-z0-9._-]+/gu, "-"));
  const records = context.ledger.records();
  const starts = records.filter((record) => record.event_type === "attempt-started" && record.dataset === task.dataset
    && record.identity_id === task.id && record.arm === arm).sort((left, right) => left.attempt_index - right.attempt_index);
  expect(starts.length <= 2 && starts.every((record, index) => record.attempt_index === index + 1
    && record.attempt_id === attemptIdentifier(task.dataset, task.id, arm, index + 1)
    && record.attempt_binding_fingerprint === expectedAttemptBinding(context.manifest, context.pilotManifest, {
      dataset: task.dataset, identityId: task.id, arm, attemptIndex: index + 1,
      retryOf: index === 0 ? null : starts[index - 1].attempt_id })),
  "MEASUREMENT_RETRY", `${task.id}/${arm} attempt chain is invalid`);
  const outcomes = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.startsWith(`${arm}-attempt-`) && name.endsWith(".json"))
      .map((name) => validateOutcomeReceipt(readJson(path.join(directory, name)), path.join(directory, name), {
        manifest: context.manifest, pilotManifest: context.pilotManifest, dataset: task.dataset, identityId: task.id, arm }))
      .sort((left, right) => left.value.attempt_index - right.value.attempt_index)
    : [];
  expect(outcomes.length <= 2, "MEASUREMENT_RETRY", `${task.id}/${arm} has too many receipts`);
  const receiptByAttempt = new Map(outcomes.map((receipt) => [receipt.value.attempt_id, receipt]));
  for (const started of starts) {
    const terminal = context.ledger.records().filter((record) => ["attempt-completed", "attempt-aborted-before-model-process"].includes(record.event_type)
      && record.attempt_id === started.attempt_id);
    if (terminal.length === 0) {
      const durableReceipt = receiptByAttempt.get(started.attempt_id);
      if (durableReceipt !== undefined) {
        const outcome = durableReceipt.value;
        context.ledger.append({ event_type: "attempt-completed", attempt_id: started.attempt_id,
          retry_of_attempt_id: outcome.retry_of_attempt_id ?? null, dataset: task.dataset, identity_id: task.id,
          stratum: started.stratum, arm, attempt_index: outcome.attempt_index,
          attempt_binding_fingerprint: outcome.attempt_binding_fingerprint,
          outcome_fingerprint: outcome.outcome_fingerprint, receipt_sha256: durableReceipt.sha256,
          scored_outcome: outcome.scored_outcome,
          infrastructure_failure_before_scoring: outcome.infrastructure_failure_before_scoring,
          model_access_required: outcome.model_access_required,
          reconciliation_required: outcome.reconciliation_required, recovered_from_durable_receipt: true,
          recorded_at: new Date().toISOString() });
        if (outcome.reconciliation_required === true) {
          context.ledger.append({ event_type: "attempt-reconciliation-required", attempt_id: started.attempt_id,
            attempt_binding_fingerprint: outcome.attempt_binding_fingerprint,
            reason_code: "recovered-durable-receipt-requires-provider-reconciliation",
            scored_outcome: outcome.scored_outcome, recorded_at: new Date().toISOString() });
        }
        continue;
      }
      const currentRecords = context.ledger.records();
      const modelStarted = currentRecords.some((record) => record.event_type === "model-process-started" && record.attempt_id === started.attempt_id);
      const reconciliation = currentRecords.some((record) => record.event_type === "attempt-reconciliation-required" && record.attempt_id === started.attempt_id);
      expect(!modelStarted && !reconciliation, "MEASUREMENT_RECONCILIATION_REQUIRED",
        `${started.attempt_id} has no terminal receipt after model process start; retry is forbidden`);
      context.ledger.append({ event_type: "attempt-aborted-before-model-process", attempt_id: started.attempt_id,
        attempt_binding_fingerprint: started.attempt_binding_fingerprint, recorded_at: new Date().toISOString() });
    } else expect(terminal.length === 1, "MEASUREMENT_LEDGER", `${started.attempt_id} has multiple terminal events`);
  }
  const reconciledRecords = context.ledger.records();
  expect(!reconciledRecords.some((record) => ledgerRecordRequiresReconciliation(record)
    && starts.some((started) => started.attempt_id === record.attempt_id)),
  "MEASUREMENT_RECONCILIATION_REQUIRED", `${task.id}/${arm} has an unresolved reconciliation or critical runner-defect obligation`);
  for (const receipt of outcomes) {
    const completed = context.ledger.records().filter((record) => record.event_type === "attempt-completed"
      && record.attempt_id === receipt.value.attempt_id);
    expect(completed.length === 1 && starts.some((record) => record.attempt_id === receipt.value.attempt_id)
      && completed[0].attempt_binding_fingerprint === receipt.value.attempt_binding_fingerprint
      && completed[0].outcome_fingerprint === receipt.value.outcome_fingerprint
      && completed[0].receipt_sha256 === receipt.sha256
      && completed[0].scored_outcome === receipt.value.scored_outcome
      && completed[0].infrastructure_failure_before_scoring === receipt.value.infrastructure_failure_before_scoring
      && completed[0].model_access_required === receipt.value.model_access_required
      && completed[0].reconciliation_required === receipt.value.reconciliation_required,
    "MEASUREMENT_RECEIPT", `${receipt.value.attempt_id} receipt does not match the append-only ledger`);
  }
  const completedRecords = context.ledger.records().filter((record) => record.event_type === "attempt-completed"
    && starts.some((started) => started.attempt_id === record.attempt_id));
  expect(completedRecords.every((record) => receiptByAttempt.has(record.attempt_id)),
    "MEASUREMENT_RECEIPT", `${task.id}/${arm} ledger completion lacks a durable receipt`);
  return Object.freeze({ outcomes: Object.freeze(outcomes.map((entry) => entry.value)),
    starts: Object.freeze(context.ledger.records().filter((record) => record.event_type === "attempt-started"
      && record.dataset === task.dataset && record.identity_id === task.id && record.arm === arm)
      .sort((left, right) => left.attempt_index - right.attempt_index)) });
}
async function runArm(context, task, arm) {
  const state = completedOutcomes(context, task, arm); const preserved = state.outcomes;
  if (preserved.some((outcome) => outcome.model_access_required)) {
    fail("MODEL_ACCESS_REQUIRED", "exact openai/gpt-5.6-luna/low binding is unavailable");
  }
  const scored = preserved.find((outcome) => outcome.scored_outcome === true);
  if (scored) return scored;
  expect(preserved.length <= 1 && preserved.every((outcome) => outcome.infrastructure_failure_before_scoring === true
    && outcome.provider_submission_disposition_established === true),
    "MEASUREMENT_RETRY", `${task.id}/${arm} preserved outcomes are not retry eligible`);
  const attemptIndex = state.starts.length + 1;
  expect(attemptIndex <= 2, "MEASUREMENT_INFRASTRUCTURE", `${task.id}/${arm} exhausted its one infrastructure retry`);
  const retryOf = state.starts.at(-1)?.attempt_id ?? null;
  const outcome = await executeAttempt(context, task, arm, attemptIndex, retryOf);
  if (outcome.model_access_required) fail("MODEL_ACCESS_REQUIRED", "exact openai/gpt-5.6-luna/low binding is unavailable");
  if (outcome.infrastructure_failure_before_scoring && attemptIndex === 1) return runArm(context, task, arm);
  expect(outcome.scored_outcome, "MEASUREMENT_INFRASTRUCTURE", `${task.id}/${arm} lacks a scored outcome after retry budget`);
  return outcome;
}
async function runPair(context, task) {
  const schedule = context.manifest.arm_order_schedule[task.dataset].entries.find((entry) => entry.identity_id === task.id);
  expect(schedule !== undefined && schedule.stratum === task.stratum,
    "MEASUREMENT_SCHEDULE", `${task.id} is absent from or changes stratum in the frozen schedule`);
  const outcomes = {};
  for (const arm of schedule.order) outcomes[arm] = await runArm(context, task, arm);
  return Object.freeze({ identity_id: task.id, dataset: task.dataset, stratum: task.stratum,
    plain: outcomes.plain, core: outcomes.core });
}
async function runPool(values, limit, worker) {
  const output = new Array(values.length); let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) { const index = next; next += 1; if (index >= values.length) return; output[index] = await worker(values[index], index); }
  });
  await Promise.all(workers); return output;
}

function initializeCredentialState(campaignRoot, authPath) {
  const stateDirectory = path.join(campaignRoot, "oauth-state"); fs.mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const state = path.join(stateDirectory, "openai-oauth-state.jsonl");
  if (!fs.existsSync(state)) {
    const source = statRegular(authPath, "OpenCode auth input");
    expect((source.stat.mode & 0o077) === 0 && (typeof process.getuid !== "function" || source.stat.uid === process.getuid()),
      "MEASUREMENT_MODEL", "OpenCode auth input is not private and owner-controlled");
    const inputDirectory = path.join(campaignRoot, "oauth-input"); fs.mkdirSync(inputDirectory, { recursive: true, mode: 0o700 });
    const input = path.join(inputDirectory, "auth.json");
    const bytes = fs.readFileSync(source.path);
    try {
      const descriptor = fs.openSync(input, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
      try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
      initializeBenchmarkV3OpenAIOAuthState({ inputPath: input, outputPath: state });
      const wipe = fs.openSync(input, fs.constants.O_RDWR);
      try { fs.writeSync(wipe, Buffer.alloc(bytes.length), 0, bytes.length, 0); fs.fsyncSync(wipe); }
      finally { fs.closeSync(wipe); }
      fs.unlinkSync(input);
    } finally { bytes.fill(0); }
  }
  return state;
}
function campaignContext(options) {
  const frozen = validateMeasurementManifest(options.manifest);
  assertClean(SOURCE_ROOT);
  expect(passed(git(SOURCE_ROOT, ["merge-base", "--is-ancestor", frozen.manifest.runner_source_sha, "HEAD"])),
    "MEASUREMENT_SOURCE", "runner source commit is not an ancestor of the current evidence branch");
  const pilotManifestFile = statRegular(options.pilotManifest, "pilot manifest");
  const pilotManifest = validateFingerprint(readJson(pilotManifestFile.path, "pilot manifest"),
    "pilot_manifest_fingerprint", "pilot manifest");
  expect(pilotManifest.pilot_manifest_fingerprint === frozen.manifest.real_pilot_manifest_fingerprint,
    "MEASUREMENT_PILOT", "pilot manifest differs from measurement manifest");
  const acceptance = validateAcceptanceReceipt(options.acceptanceReceipt, frozen.manifest);
  const verifiedPilot = verifyPilotArtifact(options.pilotArtifact, options.pilotPublicKey);
  expect(verifiedPilot.artifact_sha256 === pilotManifest.private_calibration_artifact_sha256
    && verifiedPilot.artifact_size === pilotManifest.private_calibration_artifact_size
    && verifiedPilot.public_key_sha256 === pilotManifest.issuer_spki_sha256
    && verifiedPilot.artifact.payload.receipt_fingerprint === pilotManifest.private_calibration_receipt_fingerprint,
  "MEASUREMENT_PILOT", "pilot calibration artifact differs from frozen manifest");
  const productSourceRoot = statDirectory(options.productSourceRoot, "product source root"); assertClean(productSourceRoot);
  expect(gitSha(productSourceRoot) === PRODUCT_SOURCE_SHA, "MEASUREMENT_SOURCE", "product source changed");
  const publishedInputs = verifyPublishedBenchmarkInputs(productSourceRoot);
  expect(publishedInputs.fingerprint === frozen.manifest.published_benchmark_input_fingerprint,
    "MEASUREMENT_SOURCE", "published benchmark inputs differ from the frozen manifest");
  const product = verifyBenchmarkV3ProductBundle(productSourceRoot, options.coreBundle);
  expect(product.product_bundle_fingerprint === frozen.manifest.core_bundle_fingerprint
    && product.product_bundle_fingerprint === CORE_BUNDLE_FINGERPRINT,
  "MEASUREMENT_PRODUCT", "core bundle differs from frozen manifest");
  const bundleManifest = readJson(path.join(product.materialized_core_directory, ".opencode-profile-manifest.json"), "core bundle manifest");
  expect(bundleManifest.source_tree_fingerprint === frozen.manifest.product_tree_fingerprint,
    "MEASUREMENT_PRODUCT", "product tree differs from frozen manifest");
  const opencode = verifyBenchmarkV3OpenCodeExecutable(path.resolve(options.opencode));
  expect(opencode.version === frozen.manifest.opencode_version && opencode.sha256 === frozen.manifest.opencode_executable_sha256
    && opencode.executable_fingerprint === frozen.manifest.opencode_executable_fingerprint,
    "MEASUREMENT_MODEL", "OpenCode executable differs from frozen manifest");
  verifyExactModelCatalog(opencode.path);
  const publicRuntime = loadAndVerifyPublicRuntime(options.publicRuntime);
  expect(publicRuntime.runtime.runtime_fingerprint === frozen.manifest.public_semantic_runtime_fingerprint,
    "MEASUREMENT_RUNTIME", "public runtime differs from frozen manifest");
  const pilotRuntime = loadAndVerifyPilotRuntime(options.pilotRoot, options.pilotRuntimeManifest);
  expect(pilotRuntime.manifest.runtime_universe_fingerprint === frozen.manifest.pilot_runtime_universe_fingerprint
    && pilotRuntime.manifest_sha256 === frozen.manifest.pilot_runtime_manifest_sha256,
  "MEASUREMENT_RUNTIME", "pilot runtime differs from frozen manifest");
  const campaignRoot = path.resolve(options.campaignRoot); fs.mkdirSync(campaignRoot, { recursive: true, mode: 0o700 });
  const campaignBindingPath = path.join(campaignRoot, "campaign-binding.json");
  const campaignBinding = { schema_version: 1, manifest_fingerprint: frozen.manifest.manifest_fingerprint,
    manifest_sha256: frozen.sha256, pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint,
    acceptance_receipt_fingerprint: acceptance.receipt.acceptance_receipt_fingerprint,
    acceptance_receipt_sha256: acceptance.sha256,
    runner_sha256: frozen.manifest.runner_sha256, created_at: frozen.manifest.created_at };
  if (!fs.existsSync(campaignBindingPath)) durableJson(campaignBindingPath, campaignBinding);
  else expect(canonicalJson(readJson(campaignBindingPath)) === canonicalJson(campaignBinding),
    "MEASUREMENT_RESUME", "campaign directory is bound to another manifest");
  const trustedNodePath = prepareTrustedMeasurementNode(campaignRoot, frozen.manifest);
  const oauthState = initializeCredentialState(campaignRoot, options.opencodeAuth);
  const credentialStore = createBenchmarkV3ProviderCredentialStore({ OPENAI_OAUTH_STATE_FILE: oauthState,
    BENCHMARK_V3_PROVIDER_AUTH_MODE: "oauth" });
  const repositories = { "public-eslint": statDirectory(options.publicRepository, "public repository") };
  for (const repository of Object.keys(PILOT_ADAPTERS)) repositories[repository] = statDirectory(
    path.join(options.pilotRoot, "sources", `${repository}.git`), `${repository} pilot repository`);
  const pilotRuntimeByRepository = new Map(pilotRuntime.relevant.map((entry) => [entry.repository_id, entry]));
  return Object.freeze({ manifest: frozen.manifest, pilotManifest, pilotArtifact: verifiedPilot.artifact,
    productSourceRoot, coreBundle: product.materialized_core_directory, opencode, publicRuntime,
    pilotRuntimeByRepository, pilotRoot: pilotRuntime.root, campaignRoot, credentialStore, repositories, trustedNodePath,
    ledger: ledgerAppender(path.join(campaignRoot, "attempt-ledger.jsonl")) });
}

async function runCampaign(options) {
  const frozen = validateMeasurementManifest(options.manifest);
  const campaignRoot = path.resolve(options.campaignRoot);
  const lease = acquireCampaignLease(campaignRoot, frozen.manifest.manifest_fingerprint);
  try {
    const context = campaignContext(options);
    const corpus = loadBenchmarkV3Corpus(context.productSourceRoot);
    const validationIds = corpus.families.filter((family) => family.split === "validation").map((family) => family.family_id);
    expect(corpus.corpus_fingerprint === context.manifest.corpus_fingerprint
      && canonicalJson(validationIds) === canonicalJson(context.manifest.validation_family_ids),
    "MEASUREMENT_CORPUS", "runtime validation corpus differs from the frozen manifest");
    const publicTasks = buildPublicTasks(corpus);
    const pilotTasks = buildPilotTasks(context.pilotManifest, context.pilotArtifact, context.repositories);
    const byDataset = new Map([
      ["validation", publicTasks.filter((task) => task.dataset === "validation")],
      ["pilot", pilotTasks],
    ]);
    for (const dataset of context.manifest.execution_policy.dataset_order) {
      const tasks = byDataset.get(dataset);
      await runPool(tasks, context.manifest.parallel_pairs, async (task, index) => {
        const pair = await runPair(context, task);
        process.stderr.write(`[${dataset}] ${index + 1}/${tasks.length} ${task.id} plain=${Number(pair.plain.oracle_validated_task_success)} core=${Number(pair.core.oracle_validated_task_success)}\n`);
        return pair;
      });
    }
    return Object.freeze({ status: "campaign-complete", receipt_count: DATASETS.reduce((sum, dataset) => sum
      + fs.readdirSync(path.join(context.campaignRoot, "receipts", dataset), { recursive: true }).filter((entry) => String(entry).endsWith(".json")).length, 0) });
  } finally { await lease.close(); }
}

function loadPairs(campaignRoot, dataset, ids, manifest, pilotManifest, ledgerRecords) {
  return ids.map((id) => {
    const directory = path.join(campaignRoot, "receipts", dataset, id.replace(/[^A-Za-z0-9._-]+/gu, "-"));
    const outcome = (arm) => {
      const files = fs.readdirSync(directory).filter((name) => name.startsWith(`${arm}-attempt-`) && name.endsWith(".json"));
      const receipts = files.map((name) => validateOutcomeReceipt(readJson(path.join(directory, name)), path.join(directory, name),
        { manifest, pilotManifest, dataset, identityId: id, arm })).sort((left, right) => left.value.attempt_index - right.value.attempt_index);
      const values = receipts.map((entry) => entry.value);
      const starts = ledgerRecords.filter((record) => record.event_type === "attempt-started" && record.dataset === dataset
        && record.identity_id === id && record.arm === arm).sort((left, right) => left.attempt_index - right.attempt_index);
      expect(starts.length >= 1 && starts.length <= 2 && starts.every((record, index) => record.attempt_index === index + 1
        && record.attempt_id === attemptIdentifier(dataset, id, arm, index + 1)
        && record.retry_of_attempt_id === (index === 0 ? null : starts[index - 1].attempt_id)),
      "MEASUREMENT_REPORT", `${dataset}/${id}/${arm} attempt chain is invalid`);
      for (const started of starts) {
        const terminals = ledgerRecords.filter((record) => ["attempt-completed", "attempt-aborted-before-model-process"].includes(record.event_type)
          && record.attempt_id === started.attempt_id);
        expect(terminals.length === 1, "MEASUREMENT_REPORT", `${started.attempt_id} lacks exactly one terminal ledger event`);
      }
      receipts.forEach((receipt) => {
        const completed = ledgerRecords.filter((record) => record.event_type === "attempt-completed"
          && record.attempt_id === receipt.value.attempt_id);
        expect(completed.length === 1 && starts.some((record) => record.attempt_id === receipt.value.attempt_id)
          && completed[0].attempt_binding_fingerprint === receipt.value.attempt_binding_fingerprint
          && completed[0].outcome_fingerprint === receipt.value.outcome_fingerprint
          && completed[0].receipt_sha256 === receipt.sha256
          && completed[0].scored_outcome === receipt.value.scored_outcome
          && completed[0].reconciliation_required === receipt.value.reconciliation_required,
        "MEASUREMENT_REPORT", `${receipt.value.attempt_id} receipt and ledger differ`);
      });
      const scored = values.find((entry) => entry.scored_outcome === true);
      expect(scored !== undefined && values.filter((entry) => entry.scored_outcome === true).length === 1,
        "MEASUREMENT_REPORT", `${dataset}/${id}/${arm} lacks exactly one scored outcome`);
      expect(scored.reconciliation_required === false,
        "MEASUREMENT_RECONCILIATION_REQUIRED", `${dataset}/${id}/${arm} scored outcome still requires reconciliation`);
      return scored;
    };
    const plain = outcome("plain"); const core = outcome("core");
    expect(plain.identity_id === id && core.identity_id === id && plain.stratum === core.stratum,
      "MEASUREMENT_REPORT", `${dataset}/${id} pair drifted`);
    return Object.freeze({ identity_id: id, dataset, stratum: plain.stratum, plain, core });
  });
}
function armOverhead(pairs, arm) {
  const outcomes = pairs.map((pair) => pair[arm]); const durations = outcomes.map((entry) => entry.duration_ms);
  const observableTokens = outcomes.every((entry) => Number.isSafeInteger(entry.tokens));
  const count = (predicate) => outcomes.filter(predicate).length;
  return Object.freeze({ median_duration_ms: median(durations), mean_duration_ms: mean(durations), p90_duration_ms: p90(durations),
    model_turns: outcomes.reduce((sum, entry) => sum + entry.turn_count, 0),
    tool_calls: outcomes.reduce((sum, entry) => sum + entry.tool_call_count, 0),
    tokens: observableTokens ? outcomes.reduce((sum, entry) => sum + entry.tokens, 0) : "not_observable",
    timeout_count: count((entry) => entry.timed_out), timeout_rate: count((entry) => entry.timed_out) / outcomes.length,
    authentic_terminal_completion_count: count((entry) => entry.authentic_terminal_completion),
    authentic_terminal_completion_rate: count((entry) => entry.authentic_terminal_completion) / outcomes.length,
    process_failures: count((entry) => !entry.authentic_terminal_completion),
    no_change_count: count((entry) => entry.no_change), no_change_rate: count((entry) => entry.no_change) / outcomes.length,
    scope_violation_count: count((entry) => !entry.mutation_scope_valid),
    scope_violation_rate: count((entry) => !entry.mutation_scope_valid) / outcomes.length,
    semantic_oracle_failure_count: count((entry) => !entry.task_specific_semantic_oracle_passed),
    semantic_oracle_failure_rate: count((entry) => !entry.task_specific_semantic_oracle_passed) / outcomes.length,
    syntax_failure_count: count((entry) => !entry.syntax_verification_success),
    syntax_failure_rate: count((entry) => !entry.syntax_verification_success) / outcomes.length,
    core_activation_count: arm === "core" ? count((entry) => entry.core_activation) : null,
    core_activation_rate: arm === "core" ? count((entry) => entry.core_activation) / outcomes.length : null,
    verification: arm === "core" ? Object.freeze({
      passed: count((entry) => entry.core_verification_status === "passed"),
      failed: count((entry) => entry.core_verification_status === "failed"),
      stale: count((entry) => entry.core_verification_status === "stale"),
      unavailable: count((entry) => entry.core_verification_status === "unavailable"),
    }) : null });
}
function derivedBootstrapSeed(manifestFingerprint, label) {
  expect(FP.test(manifestFingerprint ?? ""), "MEASUREMENT_STATISTICS", "manifest fingerprint is not a bootstrap seed");
  return sha256Bytes(Buffer.from(`${manifestFingerprint}\0${label}`, "utf8"));
}
function objectiveGuardrails(pairs) {
  const plain = pairs.map((pair) => pair.plain); const core = pairs.map((pair) => pair.core);
  const rate = (values, predicate) => values.filter(predicate).length / values.length;
  const containmentCount = [...plain, ...core].filter((entry) => !entry.process_containment_intact).length;
  const leakageCount = [...plain, ...core].filter((entry) => entry.hidden_data_leakage_observed === true).length;
  const leakageObservationsComplete = [...plain, ...core].every((entry) => entry.hidden_data_leakage_observed === false
    && FP.test(entry.hidden_data_preflight_fingerprint ?? ""));
  const scopePlain = rate(plain, (entry) => !entry.mutation_scope_valid);
  const scopeCore = rate(core, (entry) => !entry.mutation_scope_valid);
  const timeoutPlain = rate(plain, (entry) => entry.timed_out);
  const timeoutCore = rate(core, (entry) => entry.timed_out);
  const completionPlain = rate(plain, (entry) => entry.authentic_terminal_completion);
  const completionCore = rate(core, (entry) => entry.authentic_terminal_completion);
  const authenticVerificationCount = core.filter((entry) => entry.core_verification_receipt_authentic).length;
  const body = {
    containment_violations: Object.freeze({ count: containmentCount, maximum: 0, passed: containmentCount === 0 }),
    hidden_data_leakage: Object.freeze({ count: leakageObservationsComplete ? leakageCount : null, maximum: 0,
      observation_complete: leakageObservationsComplete, passed: leakageObservationsComplete && leakageCount === 0 }),
    out_of_scope_mutation: Object.freeze({ plain_rate: scopePlain, core_rate: scopeCore,
      candidate_minus_plain: scopeCore - scopePlain, maximum_candidate_minus_plain: 0, passed: scopeCore <= scopePlain }),
    timeout: Object.freeze({ plain_rate: timeoutPlain, core_rate: timeoutCore,
      candidate_minus_plain: timeoutCore - timeoutPlain, maximum_candidate_minus_plain: 0.05,
      passed: timeoutCore - timeoutPlain <= 0.05 }),
    authentic_terminal_completion: Object.freeze({ plain_rate: completionPlain, core_rate: completionCore,
      candidate_minus_plain: completionCore - completionPlain, minimum_candidate_minus_plain: -0.05,
      passed: completionCore - completionPlain >= -0.05 }),
    candidate_verification_receipts: Object.freeze({ required: core.length, authentic: authenticVerificationCount,
      unauthentic: core.length - authenticVerificationCount, passed: authenticVerificationCount === core.length }),
  };
  return Object.freeze({ ...body, all_passed: Object.values(body).every((entry) => entry.passed) });
}
function summarizePairs(pairs, label, manifestFingerprint, { primary = false } = {}) {
  const plainSuccess = pairs.filter((pair) => pair.plain.oracle_validated_task_success).length;
  const coreSuccess = pairs.filter((pair) => pair.core.oracle_validated_task_success).length;
  const candidateOnly = pairs.filter((pair) => !pair.plain.oracle_validated_task_success && pair.core.oracle_validated_task_success).length;
  const baselineOnly = pairs.filter((pair) => pair.plain.oracle_validated_task_success && !pair.core.oracle_validated_task_success).length;
  const discordant = candidateOnly + baselineOnly;
  const interval = pairedBootstrapInterval(pairs, BOOTSTRAP_RESAMPLES,
    primary ? manifestFingerprint : derivedBootstrapSeed(manifestFingerprint, label));
  const plain = armOverhead(pairs, "plain"); const core = armOverhead(pairs, "core");
  const strata = Object.fromEntries(STRATA.map((stratum) => [stratum, summarizePairsDescriptive(
    pairs.filter((pair) => pair.stratum === stratum), `${label}:${stratum}`, manifestFingerprint)]));
  const observability = safetyObservability();
  return Object.freeze({ family_count: pairs.length, plain_successes: plainSuccess, core_successes: coreSuccess,
    plain_success_rate: plainSuccess / pairs.length, core_success_rate: coreSuccess / pairs.length,
    absolute_paired_delta: (coreSuccess - plainSuccess) / pairs.length,
    relative_lift: plainSuccess === 0 ? null : (coreSuccess - plainSuccess) / plainSuccess,
    candidate_only_wins: candidateOnly, plain_only_wins: baselineOnly,
    baseline_only_wins: baselineOnly, ties: pairs.length - discordant,
    exact_two_sided_mcnemar_p: exactTwoSidedMcNemar(baselineOnly, candidateOnly),
    exact_one_sided_core_greater_p: binomialUpperTail(discordant, candidateOnly),
    paired_95_ci: interval, strata, safety_observability: observability,
    objective_guardrails: objectiveGuardrails(pairs),
    outcomes: Object.freeze({ semantic_success_plain: pairs.filter((pair) => pair.plain.task_specific_semantic_oracle_passed).length,
      semantic_success_core: pairs.filter((pair) => pair.core.task_specific_semantic_oracle_passed).length,
      syntax_success_plain: pairs.filter((pair) => pair.plain.syntax_verification_success).length,
      syntax_success_core: pairs.filter((pair) => pair.core.syntax_verification_success).length,
      timeouts_plain: pairs.filter((pair) => pair.plain.timed_out).length, timeouts_core: pairs.filter((pair) => pair.core.timed_out).length,
      no_change_plain: pairs.filter((pair) => pair.plain.no_change).length, no_change_core: pairs.filter((pair) => pair.core.no_change).length }),
    overhead: Object.freeze({ plain, core, median_duration_ratio: core.median_duration_ms / Math.max(plain.median_duration_ms, 1),
      mean_duration_ratio: core.mean_duration_ms / Math.max(plain.mean_duration_ms, 1),
      additional_turns: core.model_turns - plain.model_turns, additional_tool_calls: core.tool_calls - plain.tool_calls,
      additional_tokens: Number.isSafeInteger(core.tokens) && Number.isSafeInteger(plain.tokens) ? core.tokens - plain.tokens : "not_observable" }) });
}
function summarizePairsDescriptive(pairs, label, manifestFingerprint) {
  const plain = pairs.filter((pair) => pair.plain.oracle_validated_task_success).length;
  const core = pairs.filter((pair) => pair.core.oracle_validated_task_success).length;
  const candidateOnly = pairs.filter((pair) => !pair.plain.oracle_validated_task_success && pair.core.oracle_validated_task_success).length;
  const baselineOnly = pairs.filter((pair) => pair.plain.oracle_validated_task_success && !pair.core.oracle_validated_task_success).length;
  return Object.freeze({ family_count: pairs.length, plain_successes: plain, core_successes: core,
    plain_success_rate: plain / pairs.length, core_success_rate: core / pairs.length,
    absolute_paired_delta: (core - plain) / pairs.length, relative_lift: plain === 0 ? null : (core - plain) / plain,
    candidate_only_wins: candidateOnly, plain_only_wins: baselineOnly,
    baseline_only_wins: baselineOnly, ties: pairs.length - candidateOnly - baselineOnly,
    paired_95_ci: pairedBootstrapInterval(pairs, BOOTSTRAP_RESAMPLES, derivedBootstrapSeed(manifestFingerprint, label)) });
}
function decisionLabel(primary) {
  const guardrails = primary.objective_guardrails;
  if (primary.absolute_paired_delta >= 0.05 && primary.paired_95_ci[0] > 0
    && primary.exact_one_sided_core_greater_p < 0.05 && guardrails.all_passed) {
    return "MODEL-BACKED MEASUREMENT COMPLETE — CORE IMPROVES FROZEN TASK SUCCESS";
  }
  const candidateOperationalHarm = !guardrails.out_of_scope_mutation.passed
    || !guardrails.timeout.passed || !guardrails.authentic_terminal_completion.passed;
  if (primary.paired_95_ci[1] < 0 || candidateOperationalHarm) {
    return "MODEL-BACKED MEASUREMENT COMPLETE — CORE REGRESSES FROZEN TASK SUCCESS";
  }
  return "MODEL-BACKED MEASUREMENT COMPLETE — NO CLEAR DIFFERENCE";
}
function renderReport(summary) {
  const percentage = (value) => `${(100 * value).toFixed(2)}%`;
  const points = (value) => `${(100 * value).toFixed(2)} percentage points`;
  const primary = summary.primary_validation;
  const scalar = (value) => value === null ? "not_observable" : String(value);
  const dataset = (title, value, inference) => [
    `## ${title}`,
    "",
    `Inference role: ${inference}`,
    "",
    `- Families: ${value.family_count}`,
    `- Plain: ${value.plain_successes}/${value.family_count} (${percentage(value.plain_success_rate)})`,
    `- Core: ${value.core_successes}/${value.family_count} (${percentage(value.core_success_rate)})`,
    `- Absolute paired delta: ${points(value.absolute_paired_delta)}`,
    `- Relative lift: ${value.relative_lift === null ? "undefined (plain rate is zero)" : percentage(value.relative_lift)}`,
    `- Candidate-only / plain-only / ties: ${value.candidate_only_wins} / ${value.plain_only_wins} / ${value.ties}`,
    `- Paired 95% CI: [${points(value.paired_95_ci[0])}, ${points(value.paired_95_ci[1])}]`,
    `- Exact two-sided McNemar p: ${value.exact_two_sided_mcnemar_p}`,
    `- Exact one-sided p (core > plain): ${value.exact_one_sided_core_greater_p}`,
    "",
    "### Strata (descriptive)",
    "",
    ...STRATA.map((stratum) => {
      const entry = value.strata[stratum];
      return `- ${stratum}: plain ${entry.plain_successes}/${entry.family_count}, core ${entry.core_successes}/${entry.family_count}, delta ${points(entry.absolute_paired_delta)}, 95% CI [${points(entry.paired_95_ci[0])}, ${points(entry.paired_95_ci[1])}]`;
    }),
    "",
    "### Objective guardrails and outcome classes",
    "",
    `- Containment violations: ${value.objective_guardrails.containment_violations.count}`,
    `- Hidden-data leakage: ${value.objective_guardrails.hidden_data_leakage.count}`,
    `- Out-of-scope mutation rate plain / core: ${percentage(value.objective_guardrails.out_of_scope_mutation.plain_rate)} / ${percentage(value.objective_guardrails.out_of_scope_mutation.core_rate)}`,
    `- Out-of-scope mutation count plain / core: ${value.overhead.plain.scope_violation_count} / ${value.overhead.core.scope_violation_count}`,
    `- Timeout-rate delta candidate minus plain: ${points(value.objective_guardrails.timeout.candidate_minus_plain)}`,
    `- Authentic-terminal-completion-rate delta candidate minus plain: ${points(value.objective_guardrails.authentic_terminal_completion.candidate_minus_plain)}`,
    `- Candidate verification receipts authentic / required: ${value.objective_guardrails.candidate_verification_receipts.authentic} / ${value.objective_guardrails.candidate_verification_receipts.required}`,
    `- All objective guardrails passed: ${value.objective_guardrails.all_passed}`,
    `- Semantic test successes plain / core: ${value.outcomes.semantic_success_plain} / ${value.outcomes.semantic_success_core}`,
    `- Semantic oracle failures plain / core: ${value.overhead.plain.semantic_oracle_failure_count} / ${value.overhead.core.semantic_oracle_failure_count}`,
    `- Syntax verification successes plain / core: ${value.outcomes.syntax_success_plain} / ${value.outcomes.syntax_success_core}`,
    `- Timeouts plain / core: ${value.outcomes.timeouts_plain} / ${value.outcomes.timeouts_core}`,
    `- No-change outcomes plain / core: ${value.outcomes.no_change_plain} / ${value.outcomes.no_change_core}`,
    "",
    "### Operational overhead",
    "",
    `- Plain duration median / mean / p90 ms: ${value.overhead.plain.median_duration_ms.toFixed(2)} / ${value.overhead.plain.mean_duration_ms.toFixed(2)} / ${value.overhead.plain.p90_duration_ms.toFixed(2)}`,
    `- Core duration median / mean / p90 ms: ${value.overhead.core.median_duration_ms.toFixed(2)} / ${value.overhead.core.mean_duration_ms.toFixed(2)} / ${value.overhead.core.p90_duration_ms.toFixed(2)}`,
    `- Median / mean duration ratio: ${value.overhead.median_duration_ratio.toFixed(4)} / ${value.overhead.mean_duration_ratio.toFixed(4)}`,
    `- Model turns plain / core / additional: ${value.overhead.plain.model_turns} / ${value.overhead.core.model_turns} / ${value.overhead.additional_turns}`,
    `- Tool calls plain / core / additional: ${value.overhead.plain.tool_calls} / ${value.overhead.core.tool_calls} / ${value.overhead.additional_tool_calls}`,
    `- Tokens plain / core / additional: ${scalar(value.overhead.plain.tokens)} / ${scalar(value.overhead.core.tokens)} / ${scalar(value.overhead.additional_tokens)}`,
    `- Timeout rate plain / core: ${percentage(value.overhead.plain.timeout_rate)} / ${percentage(value.overhead.core.timeout_rate)}`,
    `- Process failures plain / core: ${value.overhead.plain.process_failures} / ${value.overhead.core.process_failures}`,
    `- Core activation rate: ${percentage(value.overhead.core.core_activation_rate)}`,
    `- Core verification passed / failed / stale / unavailable: ${value.overhead.core.verification.passed} / ${value.overhead.core.verification.failed} / ${value.overhead.core.verification.stale} / ${value.overhead.core.verification.unavailable}`,
    "",
  ];
  return [
    "# Core versus plain model-backed measurement",
    "",
    `Decision label: **${summary.decision_label}**`,
    "",
    `Product source: \`${summary.product_source_sha}\``,
    `Runner SHA-256: \`${summary.runner_sha256}\``,
    `Core bundle fingerprint: \`${summary.core_bundle_fingerprint}\``,
    `Model binding: \`${summary.provider}/${summary.model}\`, variant \`${summary.variant}\``,
    "",
    ...dataset("Primary public validation benchmark", primary, "primary paired inference"),
    ...dataset("Real-repository pilot", summary.real_repository_pilot, "exploratory secondary external-validity evidence; not pooled with primary inference"),
    "## Safety observability",
    "",
    "- Severe regression oracle: not_available",
    "- HIGH/MEDIUM/CRITICAL regressions: not_observable; count and rate are null",
    "- regression_free_task_success: not_computed (no frozen independent severity oracle)",
    "",
    "Severe regressions outside the frozen task-specific semantic oracles were not independently observable in this measurement.",
    "",
    "## Claim boundary",
    "",
    summary.claim.allowed,
    "",
    ...summary.claim.limitations.map((entry) => `- ${entry}`),
    "",
    "The development split was excluded before model calls. The 29-task real-repository pilot is secondary and was not combined with primary inference.",
    "",
    `On 29 frozen real-commit-derived tasks, the descriptive delta was ${(100 * summary.real_repository_pilot.absolute_paired_delta).toFixed(2)} percentage points. This pilot was secondary and not combined with primary inference.`,
    "",
    `Materialized core changed oracle-validated task success relative to plain by ${(100 * primary.absolute_paired_delta).toFixed(2)} percentage points on the frozen 60-family public validation benchmark; HIGH/MEDIUM/CRITICAL regression safety outside those task oracles was not observable.`,
  ].join("\n");
}
function reportCampaign(options) {
  const frozen = validateMeasurementManifest(options.manifest); const campaignRoot = statDirectory(options.campaignRoot, "campaign root");
  const pilotManifest = validateFingerprint(readJson(path.resolve(options.pilotManifest)), "pilot_manifest_fingerprint", "pilot manifest");
  const ledgerFile = statRegular(path.join(campaignRoot, "attempt-ledger.jsonl"), "attempt ledger");
  const ledgerRecords = loadLedger(ledgerFile.path);
  expect(!ledgerRecords.some((record) => ledgerRecordRequiresReconciliation(record)),
    "MEASUREMENT_RECONCILIATION_REQUIRED", "campaign has an unresolved reconciliation or critical runner-defect obligation");
  const datasets = {
    validation: loadPairs(campaignRoot, "validation", frozen.manifest.validation_family_ids, frozen.manifest, pilotManifest, ledgerRecords),
    pilot: loadPairs(campaignRoot, "pilot", frozen.manifest.real_pilot_identity_ids, frozen.manifest, pilotManifest, ledgerRecords),
  };
  const allowedIds = new Map([["validation", new Set(frozen.manifest.validation_family_ids)],
    ["pilot", new Set(frozen.manifest.real_pilot_identity_ids)]]);
  const completedEvents = ledgerRecords.filter((record) => record.event_type === "attempt-completed");
  expect(completedEvents.every((record) => allowedIds.get(record.dataset)?.has(record.identity_id) && ARMS.includes(record.arm)),
    "MEASUREMENT_REPORT", "ledger contains an outcome outside the frozen campaign");
  const expectedReceiptPaths = completedEvents.map((record) => `${record.dataset}/${record.identity_id.replace(/[^A-Za-z0-9._-]+/gu, "-")}/${record.arm}-attempt-${record.attempt_index}.json`).sort();
  const actualReceiptPaths = DATASETS.flatMap((dataset) => {
    const root = path.join(campaignRoot, "receipts", dataset);
    return fs.readdirSync(root, { recursive: true }).filter((entry) => String(entry).endsWith(".json"))
      .map((entry) => `${dataset}/${entry}`);
  }).sort();
  expect(canonicalJson(actualReceiptPaths) === canonicalJson(expectedReceiptPaths),
    "MEASUREMENT_REPORT", "receipt inventory differs from the append-only ledger");
  const modelStarts = ledgerRecords.filter((record) => record.event_type === "model-process-started");
  const attemptStarts = new Map(ledgerRecords.filter((record) => record.event_type === "attempt-started")
    .map((record) => [record.attempt_id, record]));
  const retryModelCalls = modelStarts.filter((record) => attemptStarts.get(record.attempt_id)?.attempt_index > 1).length;
  expect(modelStarts.length >= TOTAL_SCORED_CALLS && modelStarts.length <= MAXIMUM_MODEL_CALLS
    && retryModelCalls <= MAXIMUM_INFRASTRUCTURE_RETRIES,
  "MEASUREMENT_REPORT", "model call budget differs from the frozen 178 + 18 maximum");
  const primary = summarizePairs(datasets.validation, "validation", frozen.manifest.manifest_fingerprint, { primary: true });
  const pilot = summarizePairs(datasets.pilot, "pilot", frozen.manifest.manifest_fingerprint);
  const observability = safetyObservability();
  const summaryBody = { schema_version: 1, measurement_id: frozen.manifest.measurement_id,
    manifest_fingerprint: frozen.manifest.manifest_fingerprint, pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint,
    product_source_sha: frozen.manifest.product_source_sha, runner_sha256: frozen.manifest.runner_sha256,
    core_bundle_fingerprint: frozen.manifest.core_bundle_fingerprint, provider: frozen.manifest.provider,
    model: frozen.manifest.model, variant: frozen.manifest.variant, decision_label: decisionLabel(primary),
    severe_regression_oracle: observability.severe_regression_oracle,
    high_medium_critical_regressions: observability.high_medium_critical_regressions,
    regression_free_task_success: observability.regression_free_task_success,
    primary_validation: primary,
    development_sensitivity: frozen.manifest.development_sensitivity,
    real_repository_pilot: pilot,
    model_call_accounting: Object.freeze({ scored: TOTAL_SCORED_CALLS, infrastructure_retries: retryModelCalls,
      total: modelStarts.length, hard_maximum: MAXIMUM_MODEL_CALLS }),
    claim: Object.freeze({ allowed: `On the frozen 60-family public validation benchmark, materialized core changed oracle-validated task success from ${(100 * primary.plain_success_rate).toFixed(2)}% to ${(100 * primary.core_success_rate).toFixed(2)}%: ${(100 * primary.absolute_paired_delta).toFixed(2)} percentage points, paired 95% CI [${(100 * primary.paired_95_ci[0]).toFixed(2)}, ${(100 * primary.paired_95_ci[1]).toFixed(2)}], one-sided exact McNemar p=${primary.exact_one_sided_core_greater_p}.`,
      limitations: Object.freeze(["severe regressions outside the frozen task-specific semantic oracles were not independently observable", "exact model/provider/variant only", "exact frozen validation benchmark and product source only", "not a safety certification or universal promotion", "real-repository pilot is exploratory and separate"]) }),
    completed_at: new Date().toISOString() };
  const summary = Object.freeze({ ...summaryBody, summary_fingerprint: fingerprint(summaryBody) });
  durableJson(path.resolve(options.summaryOutput), summary);
  const report = renderReport(summary); fs.writeFileSync(path.resolve(options.reportOutput), report, { encoding: "utf8", flag: "wx", mode: 0o600 });
  const ledgerHashBody = { schema_version: 1, measurement_id: frozen.manifest.measurement_id,
    attempt_ledger_sha256: sha256File(ledgerFile.path), attempt_ledger_size: ledgerFile.stat.size,
    receipt_hashes: DATASETS.flatMap((dataset) => {
      const root = path.join(campaignRoot, "receipts", dataset);
      return fs.readdirSync(root, { recursive: true }).filter((entry) => String(entry).endsWith(".json"))
        .map((entry) => {
          const target = path.join(root, entry); const stat = fs.lstatSync(target); const receipt = readJson(target, "attempt receipt");
          expect(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
            "MEASUREMENT_REPORT", "attempt receipt archive contains an unsupported entry");
          const disposition = receipt.scored_outcome === true
            ? receipt.oracle_validated_task_success === true ? "scored_success" : "scored_failure"
            : receipt.model_access_required === true ? "model_access_required"
              : receipt.infrastructure_failure_before_scoring === true ? "infrastructure_failure_before_scoring"
                : "unresolved_non_scored";
          return { path: `${dataset}/${entry}`, sha256: sha256File(target), size: stat.size,
            attempt_id: receipt.attempt_id, arm: receipt.arm, family_id: receipt.identity_id, disposition };
        });
    }).sort((left, right) => left.path.localeCompare(right.path)) };
  durableJson(path.resolve(options.ledgerOutput), { ...ledgerHashBody, ledger_fingerprint: fingerprint(ledgerHashBody) });
  return Object.freeze({ status: "reported", decision_label: summary.decision_label,
    primary_delta_percentage_points: 100 * primary.absolute_paired_delta, summary_fingerprint: summary.summary_fingerprint });
}

async function seatbeltSocketRoundTrip(profile, socketPath, cwd) {
  let observed = "";
  const server = createNetServer((socket) => {
    socket.setEncoding("utf8"); socket.on("data", (chunk) => { observed += chunk; });
    socket.on("end", () => { socket.end("provider-proxy-ok"); });
  });
  await new Promise((resolve, reject) => {
    const failed = (error) => { server.off("listening", ready); reject(error); };
    const ready = () => { server.off("error", failed); resolve(); };
    server.once("error", failed); server.once("listening", ready); server.listen(socketPath);
  });
  try {
    const result = await new Promise((resolve) => {
      const child = spawn("/usr/bin/sandbox-exec", ["-f", profile, "/usr/bin/nc", "-U", socketPath], {
        cwd, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = ""; let stderr = ""; let spawnCode = null;
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.once("error", (error) => { spawnCode = error?.code ?? "spawn-error"; });
      const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5_000);
      child.once("close", (status, signal) => { clearTimeout(timer); resolve({ status, signal, stdout, stderr, spawnCode }); });
      child.stdin.end("provider-proxy-probe");
    });
    expect(result.status === 0 && result.signal === null && result.spawnCode === null
      && result.stdout === "provider-proxy-ok" && observed === "provider-proxy-probe",
    "MEASUREMENT_SELF_TEST", `provider proxy socket is unreachable inside Seatbelt: status=${result.status} ${result.stderr.trim()}`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    try { fs.unlinkSync(socketPath); } catch {}
  }
}

async function selfTest({ containment = true } = {}) {
  if (containment) {
    const containmentRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-self-test-"));
    try {
      const workspace = path.join(containmentRoot, "workspace"); const attempt = path.join(containmentRoot, "attempt");
      fs.mkdirSync(workspace); fs.mkdirSync(attempt);
      const socketPath = `/private/tmp/core-ab-${process.pid}-${randomBytes(12).toString("base64url")}.sock`;
      const profile = path.join(containmentRoot, "model.sb");
      fs.writeFileSync(profile, modelSandboxProfile({ workspace, attemptDirectory: attempt,
        opencodePath: process.execPath, providerProxySocket: socketPath, trustedNodePath: process.execPath }), { mode: 0o600 });
      const compiled = run("/usr/bin/sandbox-exec", ["-f", profile, "/usr/bin/true"]);
      expect(passed(compiled), "MEASUREMENT_SELF_TEST",
        `provider-only model Seatbelt profile does not apply: status=${compiled.status} signal=${compiled.signal} ${compiled.stderr.trim()}`);
      await seatbeltSocketRoundTrip(profile, socketPath, workspace);
    } finally { fs.rmSync(containmentRoot, { recursive: true, force: true }); }
  }
  const schedule = buildSchedule("validation", STRATA.flatMap((stratum) => Array.from({ length: 20 }, (_entry, index) => ({ id: `${stratum}-${index + 1}`, stratum }))));
  expect(STRATA.every((stratum) => {
    const entries = schedule.entries.filter((entry) => entry.stratum === stratum);
    return entries.filter((entry) => entry.order[0] === "plain").length === 10
      && entries.filter((entry) => entry.order[0] === "core").length === 10;
  }), "MEASUREMENT_SELF_TEST", "counterbalancing failed");
  expect(frozenScheduleValid(schedule, "validation", schedule.entries.map((entry) => entry.identity_id),
    { small: 20, medium: 20, high: 20 }),
  "MEASUREMENT_SELF_TEST", "frozen schedule semantic validation rejected the canonical schedule");
  const validSignals = Object.freeze({ arm: "plain", process_receipt_observable: true,
    authentic_terminal_completion: true, timed_out: false, process_containment_intact: true,
    no_surviving_descendants: true,
    mutation_scope_valid: true, syntax_verification_success: true, no_change: false,
    task_specific_semantic_oracle_passed: true, hidden_data_leakage_observed: false,
    authentic_current_core_verification_passed: null, explicit_infrastructure_failure: false,
    provider_submission_disposition_established: true });
  const observedSafety = safetyObservability();
  expect(observedSafety.high_medium_critical_regressions.status === "not_observable"
    && observedSafety.high_medium_critical_regressions.count === null
    && observedSafety.high_medium_critical_regressions.rate === null
    && !Object.hasOwn(observedSafety.high_medium_critical_regressions, "no_defect"),
  "MEASUREMENT_SELF_TEST", "unclassified severity was converted into no-defect evidence");
  expect(classifyAttemptSignals({ ...validSignals, severity: "unclassified" }).oracle_validated_task_success === true,
    "MEASUREMENT_SELF_TEST", "unclassified severity blocked oracle-validated measurement");
  expect(classifyAttemptSignals(validSignals).oracle_validated_task_success === true,
    "MEASUREMENT_SELF_TEST", "valid semantic, scope, containment, and completion signals did not score success");
  expect(classifyAttemptSignals({ ...validSignals, task_specific_semantic_oracle_passed: false }).oracle_validated_task_success === false,
    "MEASUREMENT_SELF_TEST", "semantic oracle failure did not score failure");
  const timeoutOutcome = classifyAttemptSignals({ ...validSignals, timed_out: true, process_receipt_observable: false });
  expect(timeoutOutcome.oracle_validated_task_success === false && timeoutOutcome.scored_outcome === true
    && timeoutOutcome.infrastructure_failure_before_scoring === false,
  "MEASUREMENT_SELF_TEST", "timeout did not score failure");
  const ambiguousTimeout = classifyAttemptSignals({ ...validSignals, timed_out: true,
    process_receipt_observable: false, provider_submission_disposition_established: false });
  expect(ambiguousTimeout.scored_outcome === true && ambiguousTimeout.reconciliation_required === true,
    "MEASUREMENT_SELF_TEST", "ambiguous timed-out submission lost its reconciliation obligation");
  expect(classifyAttemptSignals({ ...validSignals, mutation_scope_valid: false }).oracle_validated_task_success === false,
    "MEASUREMENT_SELF_TEST", "scope violation did not score failure");
  expect(classifyAttemptSignals({ ...validSignals, syntax_verification_success: false }).oracle_validated_task_success === false,
    "MEASUREMENT_SELF_TEST", "syntax failure did not score failure");
  expect(classifyAttemptSignals({ ...validSignals, no_change: true }).oracle_validated_task_success === false,
    "MEASUREMENT_SELF_TEST", "no-change result did not score failure");
  expect(classifyAttemptSignals({ ...validSignals, arm: "core",
    authentic_current_core_verification_passed: false }).oracle_validated_task_success === false,
  "MEASUREMENT_SELF_TEST", "core verification block did not score candidate failure");
  const malformedProcess = classifyAttemptSignals({ ...validSignals, arm: "core", process_receipt_observable: false });
  expect(malformedProcess.scored_outcome === false && malformedProcess.infrastructure_failure_before_scoring === true,
    "MEASUREMENT_SELF_TEST", "malformed or unobservable process receipt was not an infrastructure failure");
  expect(provenPreProviderHostTermination({ providerSubmissionCount: 0, signal: "SIGTRAP", spawnErrorCode: null })
    && !provenPreProviderHostTermination({ providerSubmissionCount: 1, signal: "SIGTRAP", spawnErrorCode: null }),
  "MEASUREMENT_SELF_TEST", "pre-provider host termination classification drifted");
  expect(classifyError("provider returned status 503") === "model-protocol"
    && classifyError("provider returned status 429") === "provider-infrastructure",
  "MEASUREMENT_SELF_TEST", "post-submission 5xx response remained retry eligible");
  expect(coreVerificationStatus({ verification_authentic: true, process_receipt_observable: true, passed: false,
    receipt: { decision: { reason: "verification_stale_after_mutation" } } }) === "stale",
  "MEASUREMENT_SELF_TEST", "stale core verification status was not preserved");
  const acceptanceExpected = { catalog_fingerprint: fingerprint({ catalog: "self-test" }) };
  const acceptanceActivation = { process_receipt_observable: true, receipt: { schema_version: 2,
    catalog_fingerprint: acceptanceExpected.catalog_fingerprint, catalog_status: "loaded",
    decision: { allowed: true, reason: "no_workspace_mutation", activation_eligible: false, activated: false },
    activation: { eligible: false, post_last_mutation_verification: false, terminal_success_allowed: true,
      mutation_revision: 0, selected_check_id: null, verification_started_count: 0,
      verification_completed_count: 0, terminal_reason: "no_workspace_mutation" },
    check: null } };
  expect(noMutationAcceptanceReceiptAuthentic(acceptanceActivation, acceptanceExpected)
    && !noMutationAcceptanceReceiptAuthentic({ ...acceptanceActivation,
      receipt: { ...acceptanceActivation.receipt, decision: { ...acceptanceActivation.receipt.decision,
        reason: "verification_passed" } } }, acceptanceExpected),
  "MEASUREMENT_SELF_TEST", "no-mutation core acceptance receipt contract drifted");
  const pluginRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-plugin-test-"));
  try {
    const configuration = path.join(pluginRoot, "configuration"); fs.mkdirSync(configuration, { mode: 0o700 });
    const plugins = path.join(configuration, "plugins"); fs.mkdirSync(plugins, { mode: 0o700 });
    const pluginFile = path.join(plugins, "provider-proxy.mjs"); fs.writeFileSync(pluginFile, "export default {};\n", { mode: 0o400 });
    const binding = providerExecutionBinding(pluginRoot, configuration, {
      plugin_file: pluginFile, credential_file: path.join(pluginRoot, "credential.json"),
      placeholder_auth_content: "{}",
    });
    const effective = JSON.parse(binding.environment.OPENCODE_CONFIG_CONTENT);
    expect(Array.isArray(effective.plugin) && effective.plugin.length === 1
      && effective.plugin[0] === pathToFileURL(fs.realpathSync.native(pluginFile)).href
      && binding.configuration_fingerprint === directoryFingerprint(configuration),
    "MEASUREMENT_SELF_TEST", "provider plugin binding or post-install configuration baseline drifted");
  } finally { fs.rmSync(pluginRoot, { recursive: true, force: true }); }
  expect(ledgerRecordRequiresReconciliation({ event_type: "attempt-completed", reconciliation_required: true })
    && !ledgerRecordRequiresReconciliation({ event_type: "attempt-completed", reconciliation_required: false }),
  "MEASUREMENT_SELF_TEST", "durable completion lost its reconciliation obligation");
  const pairs = Array.from({ length: 60 }, (_entry, index) => ({ stratum: STRATA[Math.floor(index / 20)],
    plain: { oracle_validated_task_success: index < 30 }, core: { oracle_validated_task_success: index < 36 } }));
  const selfTestSeed = fingerprint({ schema_version: 1, seed: "self-test" });
  const first = pairedBootstrapInterval(pairs, 10_000, selfTestSeed);
  const second = pairedBootstrapInterval(pairs, 10_000, selfTestSeed);
  expect(canonicalJson(first) === canonicalJson(second) && first[0] <= 0.1 && first[1] >= 0.1,
    "MEASUREMENT_SELF_TEST", "paired bootstrap is not deterministic");
  expect(exactTwoSidedMcNemar(0, 6) === 0.03125 && binomialUpperTail(6, 6) === 0.015625,
    "MEASUREMENT_SELF_TEST", "exact tests differ");
  const tampered = { schema_version: 1, value: 1, manifest_fingerprint: fingerprint({ schema_version: 1, value: 1 }) };
  validateFingerprint(tampered, "manifest_fingerprint", "self-test manifest");
  let rejected = false; try { validateFingerprint({ ...tampered, value: 2 }, "manifest_fingerprint", "tampered manifest"); } catch { rejected = true; }
  expect(rejected, "MEASUREMENT_SELF_TEST", "tampered manifest was accepted");
  const receiptRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-receipt-test-"));
  try {
    const taskFingerprint = fingerprint({ task: "self-test" });
    const manifestBody = { schema_version: 1, task_binding_fingerprints: { validation: { "self-test": taskFingerprint } } };
    const manifest = { ...manifestBody, manifest_fingerprint: fingerprint(manifestBody) };
    const pilotBody = { schema_version: 1, pilot_id: "self-test" };
    const pilotManifest = { ...pilotBody, pilot_manifest_fingerprint: fingerprint(pilotBody) };
    const binding = expectedAttemptBinding(manifest, pilotManifest, { dataset: "validation", identityId: "self-test",
      arm: "plain", attemptIndex: 1, retryOf: null });
    const outcomeBody = { schema_version: 1, dataset: "validation", identity_id: "self-test", arm: "plain",
      attempt_index: 1, attempt_id: "validation-self-test-plain-1", retry_of_attempt_id: null,
      attempt_binding_fingerprint: binding, oracle_validated_task_success: true, scored_outcome: true,
      authentic_terminal_completion: true, timed_out: false, process_containment_intact: true,
      no_surviving_descendants: true,
      mutation_scope_valid: true, syntax_verification_success: true, no_change: false,
      task_specific_semantic_oracle_passed: true,
      hidden_data_leakage_observed: false,
      hidden_data_preflight_fingerprint: fingerprint({ schema_version: 1, hidden: "absent" }),
      infrastructure_failure_before_scoring: false, model_access_required: false,
      provider_submission_disposition_established: true, reconciliation_required: false };
    const receipt = { ...outcomeBody, outcome_fingerprint: fingerprint(outcomeBody) };
    const receiptFile = receiptPath(receiptRoot, "validation", "self-test", "plain", 1); durableJson(receiptFile, receipt);
    validateOutcomeReceipt(receipt, receiptFile, { manifest, pilotManifest, dataset: "validation", identityId: "self-test", arm: "plain" });
    let receiptRejected = false;
    try { validateOutcomeReceipt({ ...receipt, scored_outcome: false }, receiptFile,
      { manifest, pilotManifest, dataset: "validation", identityId: "self-test", arm: "plain" }); } catch { receiptRejected = true; }
    expect(receiptRejected, "MEASUREMENT_SELF_TEST", "tampered outcome receipt was accepted");
    const recoveryLedger = ledgerAppender(path.join(receiptRoot, "attempt-ledger.jsonl"));
    recoveryLedger.append({ event_type: "attempt-started", attempt_id: receipt.attempt_id,
      retry_of_attempt_id: null, dataset: "validation", identity_id: "self-test", stratum: "small", arm: "plain",
      attempt_index: 1, attempt_binding_fingerprint: binding, recorded_at: new Date().toISOString() });
    const recovered = completedOutcomes({ campaignRoot: receiptRoot, manifest, pilotManifest, ledger: recoveryLedger },
      { dataset: "validation", id: "self-test" }, "plain");
    expect(recovered.outcomes.length === 1 && recovered.outcomes[0].outcome_fingerprint === receipt.outcome_fingerprint
      && recoveryLedger.records().some((entry) => entry.event_type === "attempt-completed"
        && entry.recovered_from_durable_receipt === true),
    "MEASUREMENT_SELF_TEST", "durable orphan receipt was not recovered into the append-only ledger");
  } finally { fs.rmSync(receiptRoot, { recursive: true, force: true }); }
  const leaseRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-lease-test-"));
  try {
    const leaseFingerprint = fingerprint({ schema_version: 1, lease: "self-test" });
    const firstLease = acquireCampaignLease(leaseRoot, leaseFingerprint);
    let concurrentRejected = false;
    try { acquireCampaignLease(leaseRoot, leaseFingerprint); } catch (error) {
      concurrentRejected = error?.code === "MEASUREMENT_CAMPAIGN_BUSY";
    }
    expect(concurrentRejected, "MEASUREMENT_SELF_TEST", "concurrent campaign lease was accepted");
    await firstLease.close();
    const secondLease = acquireCampaignLease(leaseRoot, leaseFingerprint); await secondLease.close();
  } finally { fs.rmSync(leaseRoot, { recursive: true, force: true }); }
  const syntheticOutcome = (arm, success, overrides = {}) => Object.freeze({ oracle_validated_task_success: success,
    duration_ms: 1, turn_count: 1, tool_call_count: 0, tokens: 1, timed_out: false,
    authentic_terminal_completion: true, process_containment_intact: true, no_surviving_descendants: true,
    hidden_data_leakage_observed: false,
    hidden_data_preflight_fingerprint: fingerprint({ schema_version: 1, hidden: "absent" }),
    mutation_scope_valid: true, task_specific_semantic_oracle_passed: success,
    syntax_verification_success: true, no_change: false, core_activation: arm === "core",
    core_verification_blocked: false, core_verification_receipt_authentic: arm === "core" ? true : null,
    core_verification_status: arm === "core" ? "passed" : null,
    ...overrides });
  const reportPairs = Array.from({ length: 60 }, (_entry, index) => Object.freeze({ stratum: STRATA[Math.floor(index / 20)],
    plain: syntheticOutcome("plain", index < 30), core: syntheticOutcome("core", index < 36) }));
  const pilotPairs = STRATA.flatMap((stratum, stratumIndex) => Array.from({ length: stratum === "high" ? 9 : 10 }, (_entry, index) =>
    Object.freeze({ stratum, plain: syntheticOutcome("plain", index < 5),
      core: syntheticOutcome("core", index < 5 + Number(stratumIndex === 0)) })));
  const primary = summarizePairs(reportPairs, "validation", selfTestSeed, { primary: true });
  const report = renderReport({ decision_label: decisionLabel(primary), product_source_sha: PRODUCT_SOURCE_SHA,
    runner_sha256: sha256File(RUNNER_PATH), core_bundle_fingerprint: CORE_BUNDLE_FINGERPRINT,
    provider: MODEL_BINDING.provider, model: MODEL_BINDING.model, variant: MODEL_BINDING.variant,
    primary_validation: primary, real_repository_pilot: summarizePairs(pilotPairs, "pilot", selfTestSeed),
    claim: { allowed: "self-test claim", limitations: [] } });
  expect(report.includes("HIGH/MEDIUM/CRITICAL regressions: not_observable; count and rate are null")
    && !/HIGH\/MEDIUM\/CRITICAL[^\n]*\b[0-9]+(?:\.[0-9]+)?%?/u.test(report),
  "MEASUREMENT_SELF_TEST", "report contains a numerical HIGH/MEDIUM/CRITICAL rate");
  expect(!/severity|unclassified/iu.test(decisionLabel.toString()),
    "MEASUREMENT_SELF_TEST", "decision code reads unclassified severity");
  const plainOnlyContainment = { ...primary, objective_guardrails: { ...primary.objective_guardrails,
    all_passed: false, containment_violations: { count: 1, maximum: 0, passed: false } } };
  expect(decisionLabel(plainOnlyContainment) !== "MODEL-BACKED MEASUREMENT COMPLETE — CORE REGRESSES FROZEN TASK SUCCESS",
    "MEASUREMENT_SELF_TEST", "plain-only absolute guardrail failure was falsely attributed as a core regression");
  return Object.freeze({ status: "passed", schedule_fingerprint: schedule.schedule_fingerprint,
    bootstrap_interval: first, exact_two_sided_0_6: exactTwoSidedMcNemar(0, 6), exact_one_sided_6_6: binomialUpperTail(6, 6),
    measurement_contract_fingerprint: loadMeasurementContract().fingerprint, model_free_contract_tests: 18,
    seatbelt_containment: containment ? "passed" : "not_run" });
}

const { values } = parseArgs({ options: {
  mode: { type: "string" },
  "product-source-root": { type: "string" }, "core-bundle": { type: "string" }, opencode: { type: "string" },
  "public-repository": { type: "string" }, "public-runtime": { type: "string" }, output: { type: "string" },
  "pilot-root": { type: "string" }, "pilot-artifact": { type: "string" }, "pilot-public-key": { type: "string" },
  "pilot-runtime-manifest": { type: "string" }, "pilot-manifest": { type: "string" },
  "pilot-manifest-output": { type: "string" }, "manifest": { type: "string" }, "manifest-output": { type: "string" },
  "acceptance-output": { type: "string" }, "acceptance-receipt": { type: "string" },
  "campaign-root": { type: "string" }, "opencode-auth": { type: "string" },
  "summary-output": { type: "string" }, "report-output": { type: "string" }, "ledger-output": { type: "string" },
  "timeout-ms": { type: "string", default: String(DEFAULT_TIMEOUT_MS) }, "parallel-pairs": { type: "string", default: "4" },
}, strict: true });

const required = (name) => {
  const value = values[name]; if (typeof value !== "string" || value.length === 0) fail("MEASUREMENT_ARGUMENT", `--${name} is required`); return value;
};

try {
  let result;
  if (values.mode === "self-test") result = await selfTest();
  else if (values.mode === "contract-self-test") result = await selfTest({ containment: false });
  else if (values.mode === "prepare-public-runtime") result = preparePublicRuntime(required("public-repository"), required("output"));
  else if (values.mode === "freeze") result = await freezeManifests({
    productSourceRoot: required("product-source-root"), coreBundle: required("core-bundle"), opencode: required("opencode"),
    publicRuntime: required("public-runtime"), pilotRoot: required("pilot-root"), pilotArtifact: required("pilot-artifact"),
    pilotPublicKey: required("pilot-public-key"), pilotRuntimeManifest: required("pilot-runtime-manifest"),
    pilotManifestOutput: required("pilot-manifest-output"), manifestOutput: required("manifest-output"),
    timeoutMs: required("timeout-ms"), parallelPairs: required("parallel-pairs"),
  });
  else if (values.mode === "acceptance-probe") result = await runAcceptanceProbes({ manifest: required("manifest"),
    coreBundle: required("core-bundle"), opencode: required("opencode"), acceptanceOutput: required("acceptance-output") });
  else if (values.mode === "run") result = await runCampaign({ manifest: required("manifest"), pilotManifest: required("pilot-manifest"),
    acceptanceReceipt: required("acceptance-receipt"),
    productSourceRoot: required("product-source-root"), coreBundle: required("core-bundle"), opencode: required("opencode"),
    opencodeAuth: required("opencode-auth"), publicRepository: required("public-repository"), publicRuntime: required("public-runtime"),
    pilotRoot: required("pilot-root"), pilotArtifact: required("pilot-artifact"), pilotPublicKey: required("pilot-public-key"),
    pilotRuntimeManifest: required("pilot-runtime-manifest"), campaignRoot: required("campaign-root") });
  else if (values.mode === "report") result = reportCampaign({ manifest: required("manifest"), pilotManifest: required("pilot-manifest"),
    campaignRoot: required("campaign-root"), summaryOutput: required("summary-output"), reportOutput: required("report-output"),
    ledgerOutput: required("ledger-output") });
  else fail("MEASUREMENT_ARGUMENT", "--mode must be contract-self-test, self-test, prepare-public-runtime, freeze, acceptance-probe, run, or report");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  if (error?.code === "MODEL_ACCESS_REQUIRED") {
    process.stderr.write("MODEL ACCESS REQUIRED\n"); process.exitCode = 78;
  } else {
    process.stderr.write(`${error?.code ?? "MEASUREMENT_UNEXPECTED"}: ${error?.message ?? String(error)}\n`); process.exitCode = 1;
  }
}
