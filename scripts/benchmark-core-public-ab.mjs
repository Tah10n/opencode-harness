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
const DATASETS = Object.freeze(["validation", "development", "pilot"]);
const ARMS = Object.freeze(["plain", "core"]);
const PRODUCT_SOURCE_SHA = "89f1f7f1980a829d7da162fcd737d0c52613225d";
const MODEL_BINDING = Object.freeze({ provider: "openai", model: "gpt-5.6-luna", variant: "low" });
const DEFAULT_TIMEOUT_MS = 900_000;
const BOOTSTRAP_RESAMPLES = 100_000;
const BOOTSTRAP_SEED = "core-public-ab-paired-bootstrap-v1";
const SCHEDULE_SEED = "core-public-ab-counterbalanced-v1";
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
  "measurement-manifest.json",
  "scripts/benchmark-core-public-ab.mjs",
]);
const MEASUREMENT_SOURCE_ALLOWED_PREFIXES = Object.freeze([
  "benchmarks/results/core-public-ab-measurement-v1/",
  "docs/research/core-public-ab-measurement-v1/",
]);
const PROVIDER_RESPONSE_LIMIT = 64 * 1024 * 1024;
const FROZEN_SAFETY_ORACLE = Object.freeze({
  independent_new_regression_classification: false,
  reason: "published benchmark v3 has task-specific semantic oracles and unclassified defect severity, but no frozen oracle for new HIGH/MEDIUM/CRITICAL regressions",
});

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
function pairedBootstrapInterval(pairs, resamples = BOOTSTRAP_RESAMPLES, seed = BOOTSTRAP_SEED) {
  expect(Array.isArray(pairs) && pairs.length > 0 && Number.isSafeInteger(resamples) && resamples >= 10_000,
    "MEASUREMENT_STATISTICS", "paired bootstrap input is invalid");
  const random = xorshift(seed);
  const deltas = new Array(resamples);
  for (let sample = 0; sample < resamples; sample += 1) {
    let sum = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[Math.floor(random() * pairs.length)];
      sum += Number(pair.core.regression_free_task_success) - Number(pair.plain.regression_free_task_success);
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
  const files = canonicalFileInventory(SOURCE_ROOT, [...BENCHMARK_INPUT_PATHS, "scripts/benchmark-core-public-ab.mjs"]);
  return fingerprint({ schema_version: 1, files, public_oracle: "runner-owned-hidden-tests-seatbelt-no-network-v1",
    pilot_oracle: "epoch2-calibration-bytes-seatbelt-no-network-v1", task_success: "regression-free-task-success-v1",
    statistics: { bootstrap_resamples: BOOTSTRAP_RESAMPLES, bootstrap_seed: BOOTSTRAP_SEED,
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

function freezeManifests(options) {
  assertClean(SOURCE_ROOT);
  const runnerSha256 = sha256File(RUNNER_PATH);
  const productSourceRoot = statDirectory(options.productSourceRoot, "product source root");
  assertClean(productSourceRoot);
  expect(gitSha(productSourceRoot) === PRODUCT_SOURCE_SHA, "MEASUREMENT_SOURCE", "product source SHA differs");
  const publishedInputs = verifyPublishedBenchmarkInputs(productSourceRoot);
  const product = verifyBenchmarkV3ProductBundle(productSourceRoot, options.coreBundle);
  const opencode = verifyBenchmarkV3OpenCodeExecutable(path.resolve(options.opencode));
  expect(opencode.variant_supported, "MEASUREMENT_MODEL", "OpenCode lacks --variant support");
  verifyExactModelCatalog(opencode.path);
  const publicRuntime = loadAndVerifyPublicRuntime(options.publicRuntime);
  const pilotRuntime = loadAndVerifyPilotRuntime(options.pilotRoot, options.pilotRuntimeManifest);
  const pilotManifest = createPilotManifest({ artifactPath: options.pilotArtifact,
    publicKeyPath: options.pilotPublicKey, pilotRoot: options.pilotRoot });
  const corpus = loadBenchmarkV3Corpus(productSourceRoot);
  const validation = corpus.families.filter((family) => family.split === "validation");
  const development = corpus.families.filter((family) => family.split === "development");
  expect(validation.length === 60 && development.length === 60
    && STRATA.every((stratum) => validation.filter((family) => family.stratum === stratum).length === 20)
    && STRATA.every((stratum) => development.filter((family) => family.stratum === stratum).length === 20),
  "MEASUREMENT_CORPUS", "public benchmark split counts differ");
  expect(FROZEN_SAFETY_ORACLE.independent_new_regression_classification === true,
    "MEASUREMENT_SAFETY_ORACLE_REQUIRED", FROZEN_SAFETY_ORACLE.reason);
  const schedules = Object.freeze({
    validation: buildSchedule("validation", validation.map((family) => ({ id: family.family_id, stratum: family.stratum }))),
    development: buildSchedule("development", development.map((family) => ({ id: family.family_id, stratum: family.stratum }))),
    pilot: pilotManifest.schedule,
  });
  const bundleManifest = readJson(path.join(product.materialized_core_directory, ".opencode-profile-manifest.json"), "core bundle manifest");
  const body = {
    schema_version: 1,
    measurement_id: "core-public-ab-measurement-v1",
    runner_sha256: runnerSha256,
    runner_source_commit: gitSha(SOURCE_ROOT),
    product_source_sha: PRODUCT_SOURCE_SHA,
    product_source_tree_fingerprint: bundleManifest.source_tree_fingerprint,
    core_bundle_fingerprint: product.product_bundle_fingerprint,
    corpus_fingerprint: corpus.corpus_fingerprint,
    published_benchmark_input_fingerprint: publishedInputs.fingerprint,
    published_benchmark_input_files: publishedInputs.files,
    validation_family_ids: validation.map((family) => family.family_id),
    development_family_ids: development.map((family) => family.family_id),
    real_pilot_identity_ids: pilotManifest.tasks.map((task) => task.identity_id),
    task_binding_fingerprints: Object.freeze({
      validation: Object.freeze(Object.fromEntries(validation.map((family) => [family.family_id, family.manifest.public_surface_fingerprint]))),
      development: Object.freeze(Object.fromEntries(development.map((family) => [family.family_id, family.manifest.public_surface_fingerprint]))),
      pilot: Object.freeze(Object.fromEntries(pilotManifest.tasks.map((task) => [task.identity_id, task.task_binding_fingerprint]))),
    }),
    real_pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint,
    model: MODEL_BINDING.model,
    provider: MODEL_BINDING.provider,
    variant: MODEL_BINDING.variant,
    opencode_version: opencode.version,
    opencode_executable_sha256: opencode.sha256,
    timeout_ms: Number(options.timeoutMs),
    parallel_pairs: Number(options.parallelPairs),
    arm_order_schedule: schedules,
    retry_policy: Object.freeze({ exact_resume: true, maximum_infrastructure_retries: 1,
      retry_eligible: "proven-infrastructure-failure-before-scored-outcome-only",
      forbidden: Object.freeze(["timeout", "bad-solution", "model-protocol-failure", "failed-hidden-test", "failed-core-verification", "already-scored-outcome"]) }),
    evaluator_fingerprint: evaluatorFingerprint(),
    public_semantic_runtime_fingerprint: publicRuntime.runtime.runtime_fingerprint,
    pilot_runtime_universe_fingerprint: pilotRuntime.manifest.runtime_universe_fingerprint,
    pilot_runtime_manifest_sha256: pilotRuntime.manifest_sha256,
    private_pilot_artifact_sha256: pilotManifest.private_calibration_artifact_sha256,
    statistical_method: Object.freeze({ paired_ci: "deterministic-percentile-paired-bootstrap",
      resamples: BOOTSTRAP_RESAMPLES, seed: BOOTSTRAP_SEED, confidence_level: 0.95,
      primary_test: "exact-mcnemar", one_sided_direction: "core-greater-than-plain" }),
    execution_policy: Object.freeze({ development_sensitivity: "included-and-frozen-before-campaign",
      dataset_order: Object.freeze(["validation", "development", "pilot"]), opportunity_gate: false,
      model_network: "provider-only-through-host-isolated-credential-bridge",
      model_tools: Object.freeze({ local_read_edit: "allow", shell: "deny", web: "deny", external_directory: "deny", delegation: "deny" }) }),
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
  expect(manifest.schema_version === 1 && manifest.measurement_id === "core-public-ab-measurement-v1"
    && manifest.runner_sha256 === sha256File(RUNNER_PATH) && manifest.product_source_sha === PRODUCT_SOURCE_SHA
    && manifest.provider === MODEL_BINDING.provider && manifest.model === MODEL_BINDING.model
    && manifest.variant === MODEL_BINDING.variant && manifest.evaluator_fingerprint === evaluatorFingerprint()
    && manifest.published_benchmark_input_fingerprint === fingerprint({ schema_version: 1,
      files: canonicalFileInventory(SOURCE_ROOT, BENCHMARK_INPUT_PATHS) })
    && manifest.validation_family_ids.length === 60 && manifest.development_family_ids.length === 60
    && manifest.real_pilot_identity_ids.length === 29 && manifest.execution_policy?.opportunity_gate === false,
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
function candidateCheck(task) {
  const syntaxProgram = "const{spawnSync}=require('node:child_process');for(const f of process.argv.slice(1)){const r=spawnSync(process.execPath,['--check',f],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1)}";
  return Object.freeze({ check_id: "core-public-ab-syntax-all", scope_prefixes: task.allowed_mutation_paths.slice().sort(),
    cost_rank: 1, executable_path: fs.realpathSync.native(process.execPath), argv: ["-e", syntaxProgram],
    immutable_input_paths: [], subject_paths: task.subject_paths, cwd: ".", timeout_ms: 30_000 });
}
async function installCatalog(workspace, task, coreBundle) {
  const target = path.join(workspace, ".git", "opencode-harness", "core", "checks.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ schema_version: 2, catalog_id: "core-public-ab-public", checks: [candidateCheck(task)] })}\n`);
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
function modelSandboxProfile({ workspace, attemptDirectory, opencodePath, providerProxySocket }) {
  expect(process.platform === "darwin" && fs.existsSync("/usr/bin/sandbox-exec"),
    "MEASUREMENT_CONTAINMENT", "macOS Seatbelt is required for this frozen runner");
  const system = ["/System", "/usr", "/Library", "/opt/homebrew", path.dirname(process.execPath)]
    .filter((entry, index, values) => fs.existsSync(entry) && values.indexOf(entry) === index);
  return ["(version 1)", "(deny default)", "(allow process-exec process-fork)",
    "(allow signal (target same-sandbox))", "(allow process-info* (target same-sandbox))",
    `(allow network-outbound (literal ${JSON.stringify(path.resolve(providerProxySocket))}))`,
    "(allow mach-lookup)", "(allow sysctl-read)", "(allow file-read-metadata)", "(allow file-read-data (literal \"/\"))",
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
function modelEnvironment(attemptDirectory, configuration, credential) {
  const isolatedHome = path.join(attemptDirectory, "home"); const isolatedTmp = path.join(attemptDirectory, "tmp");
  const data = path.join(attemptDirectory, "xdg-data"); const cache = path.join(attemptDirectory, "xdg-cache");
  for (const directory of [isolatedHome, isolatedTmp, data, cache]) fs.mkdirSync(directory, { mode: 0o700 });
  return Object.freeze({ PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: isolatedHome, TMPDIR: isolatedTmp,
    LANG: "C", LC_ALL: "C", TZ: "UTC", XDG_DATA_HOME: data, XDG_CACHE_HOME: cache,
    OPENCODE_AUTO_SHARE: "false", OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_CLAUDE_CODE: "true",
    OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: "true", OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "true",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "false", OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "true", OPENCODE_ENABLE_EXA: "false",
    OPENCODE_CONFIG_DIR: configuration, OPENCODE_CONFIG_CONTENT: JSON.stringify(OVERLAY),
    OPENCODE_AUTH_CONTENT: credential.placeholder_auth_content,
    CORE_PUBLIC_AB_PROVIDER_PROXY_FILE: credential.credential_file });
}

async function installCredentialBridge({ attemptDirectory, configuration, credentialStore }) {
  let proxy = null;
  const credentialFile = path.join(attemptDirectory, "host-credential.json");
  try {
    proxy = await createProviderProxy(credentialStore,
      `/private/tmp/core-ab-${process.pid}-${randomBytes(12).toString("base64url")}.sock`);
    fs.writeFileSync(credentialFile, JSON.stringify(proxy.payload), { encoding: "utf8", flag: "wx", mode: 0o600 });
    const plugins = path.join(configuration, "plugins"); fs.mkdirSync(plugins, { recursive: true, mode: 0o700 });
    const plugin = path.join(plugins, "core-public-ab-provider-proxy.mjs");
    fs.writeFileSync(plugin, PROVIDER_PROXY_PLUGIN, { encoding: "utf8", flag: "wx", mode: 0o400 });
    return Object.freeze({ credential_file: credentialFile, provider_proxy_socket: proxy.socket_path,
      placeholder_auth_content: JSON.stringify({ openai: { type: "api", key: "core-public-ab-host-provider-proxy" } }),
      status() { return proxy.status(); },
      async close() { await proxy.close(); } });
  } catch (error) {
    await proxy?.close(); throw error;
  }
}

function parseOpenCodeEvents(stdout) {
  let jsonEventCount = 0; let terminalEventCount = 0; let openSteps = 0; let turns = 0;
  let finalTextEligible = false; let protocolValid = true; let tokens = 0; let usageObserved = false;
  const toolStates = new Map(); const known = new Set(["step_start", "step_finish", "tool_use", "text", "reasoning", "error"]);
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
    if (value.type === "text") { if (typeof value.part?.text !== "string") protocolValid = false; else if (value.part.text.trim()) finalTextEligible = true; }
    const usage = value.usage ?? value.part?.usage ?? value.data?.usage;
    const total = usage?.total_tokens ?? usage?.totalTokens;
    if (Number.isSafeInteger(total) && total >= 0) { tokens += total; usageObserved = true; }
  }
  terminalEventCount = finalTextEligible ? 1 : 0;
  const unfinished = [...toolStates.values()].filter((status) => !["completed", "error", "failed"].includes(status)).length;
  protocolValid &&= jsonEventCount > 0 && terminalEventCount === 1 && openSteps === 0 && unfinished === 0;
  return Object.freeze({ protocol_valid: protocolValid, json_event_count: jsonEventCount,
    terminal_event_count: terminalEventCount, open_step_count: openSteps, unfinished_tool_count: unfinished,
    turn_count: turns, tool_call_count: toolStates.size, tokens: usageObserved ? tokens : "not_observable",
    usage_observed: usageObserved });
}
function classifyError(stderr) {
  const text = stderr.toLowerCase();
  if (/model.+(?:not found|unavailable|access|permission)|unknown model|does not have access/u.test(text)) return "model-access";
  if (/unauthorized|forbidden|oauth|credential|token.+expired|status 401|status 403/u.test(text)) return "model-access";
  if (/rate.?limit|status 429|temporarily unavailable|status 5[0-9][0-9]/u.test(text)) return "provider-infrastructure";
  if (/sandbox|operation not permitted|spawn|enoent|eacces/u.test(text)) return "host-infrastructure";
  return "model-protocol";
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
  if (bytes.trim().length === 0) return Object.freeze({ authentic: false, passed: false, receipt: null });
  let receipt; try { receipt = JSON.parse(bytes); } catch { return Object.freeze({ authentic: false, passed: false, receipt: null }); }
  const child = receipt?.child_execution;
  const authentic = receipt?.schema_version === 2 && receipt.catalog_fingerprint === expected.catalog_fingerprint
    && receipt.catalog_status === "loaded" && typeof receipt.decision?.allowed === "boolean"
    && typeof receipt.decision?.reason === "string" && typeof receipt.activation?.post_last_mutation_verification === "boolean"
    && child?.schema_version === 1 && (child.status === null || Number.isSafeInteger(child.status))
    && (child.signal === null || typeof child.signal === "string") && (child.error_code === null || typeof child.error_code === "string")
    && receipt.check?.command_fingerprint === expected.command_fingerprint;
  const passedActivation = authentic && receipt.decision.allowed === true
    && receipt.decision.reason === "post_last_mutation_verification_passed"
    && receipt.activation.post_last_mutation_verification === true && receipt.check?.status === "passed";
  return Object.freeze({ authentic, passed: passedActivation, receipt });
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
  expect(task.public_surface_fingerprint === context.manifest.task_binding_fingerprints?.[task.dataset]?.[task.id],
    "MEASUREMENT_BINDING", `${task.id} runtime task binding differs from manifest`);
  const attemptBinding = expectedAttemptBinding(context.manifest, context.pilotManifest, { dataset: task.dataset,
    identityId: task.id, arm, attemptIndex, retryOf });
  context.ledger.append({ event_type: "attempt-started", attempt_id: attemptId, retry_of_attempt_id: retryOf,
    dataset: task.dataset, identity_id: task.id, stratum: task.stratum, arm, attempt_index: attemptIndex,
    attempt_binding_fingerprint: attemptBinding, recorded_at: new Date().toISOString() });
  let workspace = null; let attemptDirectory = null; let credential = null; let modelProcessStarted = false;
  try {
    workspace = materializeTaskWorkspace(task, context.repositories);
    const before = captureWorkspace(workspace);
    const catalogBefore = arm === "core" ? await installCatalog(workspace, task, context.coreBundle) : null;
    attemptDirectory = fs.mkdtempSync(path.join(context.campaignRoot, "attempt-private-"));
    const configuration = path.join(attemptDirectory, "configuration");
    copyConfiguration(arm === "core" ? context.coreBundle : null, configuration);
    credential = await installCredentialBridge({ attemptDirectory, configuration,
      credentialStore: context.credentialStore });
    const configurationBefore = directoryFingerprint(configuration);
    const profile = path.join(attemptDirectory, "model.sb");
    fs.writeFileSync(profile, modelSandboxProfile({ workspace, attemptDirectory, opencodePath: context.opencode.path,
      providerProxySocket: credential.provider_proxy_socket }), { mode: 0o600 });
    const opencodeArgs = ["run", "--format", "json", "--model", `${MODEL_BINDING.provider}/${MODEL_BINDING.model}`,
      "--variant", MODEL_BINDING.variant, "--agent", arm === "core" ? "core" : "build", "--dir", workspace, task.prompt];
    const file = arm === "core" ? process.execPath : context.opencode.path;
    const args = arm === "core" ? [path.join(configuration, "runtime", "opencode-core.mjs"), "--workspace", workspace,
      "--opencode", context.opencode.path, "--receipt-fd", "3", "--child-timeout-ms", String(context.manifest.timeout_ms), "--", ...opencodeArgs] : opencodeArgs;
    context.ledger.append({ event_type: "model-process-started", attempt_id: attemptId,
      attempt_binding_fingerprint: attemptBinding, recorded_at: new Date().toISOString() });
    modelProcessStarted = true;
    const managed = await runManagedProcess({ file, args, cwd: workspace,
      env: modelEnvironment(attemptDirectory, configuration, credential), profile,
      timeoutMs: context.manifest.timeout_ms,
      candidate: arm === "core" });
    await credential.close(); const providerEvidence = credential.status(); credential = null;
    expect(managed.teardown_verified === true, "MEASUREMENT_RECONCILIATION_REQUIRED",
      `${attemptId} model process tree teardown is unverified; hidden oracle remains sealed`);
    const events = parseOpenCodeEvents(managed.stdout);
    const activation = arm === "core" ? parseActivation(managed.activation, catalogBefore) : null;
    const child = arm === "core" ? activation?.receipt?.child_execution : { status: managed.status, signal: managed.signal,
      error_code: managed.spawn_error_code };
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
    const coreVerificationBlocked = arm === "core" && (!activation?.authentic || !activation.passed || catalogDrift || configurationDrift);
    const timeout = managed.timed_out || child?.error_code === "ETIMEDOUT" || oracle.oracle_timeout;
    const authenticProcessCompletion = ordinaryCompletion && events.json_event_count > 0 && events.protocol_valid;
    const hostEnvironmentIntegrity = !configurationDrift && !catalogDrift;
    const regressionFreeSuccess = oracle.semantic_passed && violations.length === 0 && syntaxPassed
      && !timeout && authenticProcessCompletion && !coreVerificationBlocked
      && hostEnvironmentIntegrity;
    const errorClass = authenticProcessCompletion ? null : classifyError(`${managed.stderr}\n${managed.stdout}\n${managed.activation}`);
    const providerAccessFailure = providerEvidence.provider_response_statuses.some((status) => status === 401 || status === 403);
    const providerInfrastructureFailure = providerEvidence.provider_response_statuses.some((status) => status === 429 || status >= 500);
    const modelAccessRequired = errorClass === "model-access" || providerAccessFailure;
    if (providerEvidence.ambiguous_submission_count > 0 && !timeout) {
      fail("MEASUREMENT_RECONCILIATION_REQUIRED",
        `${attemptId} has an ambiguous provider submission after the model boundary; retry is forbidden`);
    }
    const infrastructureFailureBeforeScoring = !timeout && changed.length === 0 && !oracle.semantic_passed
      && !authenticProcessCompletion && !configurationDrift && !catalogDrift
      && providerEvidence.ambiguous_submission_count === 0 && !modelAccessRequired
      && (providerInfrastructureFailure || (providerEvidence.provider_submission_count === 0
        && ["host-infrastructure", "provider-infrastructure"].includes(errorClass)));
    const scoredOutcome = !infrastructureFailureBeforeScoring;
    const outcomeBody = { schema_version: 1, attempt_id: attemptId, retry_of_attempt_id: retryOf,
      attempt_binding_fingerprint: attemptBinding, dataset: task.dataset, identity_id: task.id, stratum: task.stratum,
      arm, attempt_index: attemptIndex, severity: task.severity,
      regression_free_task_success: regressionFreeSuccess,
      semantic_test_success: oracle.semantic_passed, syntax_verification_success: syntaxPassed,
      scope_violation: violations.length > 0, scope_violations: violations, changed_paths: changed,
      timeout, no_change: changed.length === 0, authentic_process_completion: authenticProcessCompletion,
      model_protocol_valid: events.protocol_valid, core_activation: arm === "core" ? activation?.passed === true : null,
      core_verification_blocked: coreVerificationBlocked, core_verification_authentic: arm === "core" ? activation?.authentic === true : null,
      configuration_drift: configurationDrift, catalog_drift: catalogDrift,
      process_status: child?.status ?? managed.status, process_signal: child?.signal ?? managed.signal,
      infrastructure_failure_before_scoring: infrastructureFailureBeforeScoring,
      model_access_required: modelAccessRequired, scored_outcome: scoredOutcome || regressionFreeSuccess,
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
      model_access_required: outcome.model_access_required, recorded_at: outcome.recorded_at });
    return outcome;
  } catch (error) {
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
      arm, attempt_index: attemptIndex, severity: task.severity, regression_free_task_success: false,
      semantic_test_success: false, syntax_verification_success: false, scope_violation: false,
      scope_violations: [], changed_paths: [], timeout: false, no_change: true,
      authentic_process_completion: false, model_protocol_valid: false, core_activation: null,
      core_verification_blocked: false, core_verification_authentic: null,
      configuration_drift: false, catalog_drift: false, process_status: null, process_signal: null,
      infrastructure_failure_before_scoring: !modelAccessRequired, model_access_required: modelAccessRequired,
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
      model_access_required: outcome.model_access_required, recorded_at: outcome.recorded_at });
    return outcome;
  } finally {
    await credential?.close();
    if (attemptDirectory !== null) fs.rmSync(attemptDirectory, { recursive: true, force: true });
    if (workspace !== null) fs.rmSync(workspace, { recursive: true, force: true });
  }
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
  for (const started of starts) {
    const terminal = records.filter((record) => ["attempt-completed", "attempt-aborted-before-model-process"].includes(record.event_type)
      && record.attempt_id === started.attempt_id);
    if (terminal.length === 0) {
      const modelStarted = records.some((record) => record.event_type === "model-process-started" && record.attempt_id === started.attempt_id);
      const reconciliation = records.some((record) => record.event_type === "attempt-reconciliation-required" && record.attempt_id === started.attempt_id);
      expect(!modelStarted && !reconciliation, "MEASUREMENT_RECONCILIATION_REQUIRED",
        `${started.attempt_id} has no terminal receipt after model process start; retry is forbidden`);
      context.ledger.append({ event_type: "attempt-aborted-before-model-process", attempt_id: started.attempt_id,
        attempt_binding_fingerprint: started.attempt_binding_fingerprint, recorded_at: new Date().toISOString() });
    } else expect(terminal.length === 1, "MEASUREMENT_LEDGER", `${started.attempt_id} has multiple terminal events`);
  }
  const outcomes = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.startsWith(`${arm}-attempt-`) && name.endsWith(".json"))
      .map((name) => validateOutcomeReceipt(readJson(path.join(directory, name)), path.join(directory, name), {
        manifest: context.manifest, pilotManifest: context.pilotManifest, dataset: task.dataset, identityId: task.id, arm }))
      .sort((left, right) => left.value.attempt_index - right.value.attempt_index)
    : [];
  expect(outcomes.length <= 2, "MEASUREMENT_RETRY", `${task.id}/${arm} has too many receipts`);
  for (const receipt of outcomes) {
    const completed = context.ledger.records().filter((record) => record.event_type === "attempt-completed"
      && record.attempt_id === receipt.value.attempt_id);
    expect(completed.length === 1 && starts.some((record) => record.attempt_id === receipt.value.attempt_id)
      && completed[0].attempt_binding_fingerprint === receipt.value.attempt_binding_fingerprint
      && completed[0].outcome_fingerprint === receipt.value.outcome_fingerprint
      && completed[0].receipt_sha256 === receipt.sha256
      && completed[0].scored_outcome === receipt.value.scored_outcome
      && completed[0].infrastructure_failure_before_scoring === receipt.value.infrastructure_failure_before_scoring
      && completed[0].model_access_required === receipt.value.model_access_required,
    "MEASUREMENT_RECEIPT", `${receipt.value.attempt_id} receipt does not match the append-only ledger`);
  }
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
  expect(preserved.length <= 1 && preserved.every((outcome) => outcome.infrastructure_failure_before_scoring === true),
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
  expect(schedule !== undefined, "MEASUREMENT_SCHEDULE", `${task.id} is absent from frozen schedule`);
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
  expect(passed(git(SOURCE_ROOT, ["merge-base", "--is-ancestor", frozen.manifest.runner_source_commit, "HEAD"])),
    "MEASUREMENT_SOURCE", "runner source commit is not an ancestor of the current evidence branch");
  const pilotManifestFile = statRegular(options.pilotManifest, "pilot manifest");
  const pilotManifest = validateFingerprint(readJson(pilotManifestFile.path, "pilot manifest"),
    "pilot_manifest_fingerprint", "pilot manifest");
  expect(pilotManifest.pilot_manifest_fingerprint === frozen.manifest.real_pilot_manifest_fingerprint,
    "MEASUREMENT_PILOT", "pilot manifest differs from measurement manifest");
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
  expect(product.product_bundle_fingerprint === frozen.manifest.core_bundle_fingerprint,
    "MEASUREMENT_PRODUCT", "core bundle differs from frozen manifest");
  const opencode = verifyBenchmarkV3OpenCodeExecutable(path.resolve(options.opencode));
  expect(opencode.version === frozen.manifest.opencode_version && opencode.sha256 === frozen.manifest.opencode_executable_sha256,
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
    runner_sha256: frozen.manifest.runner_sha256, created_at: frozen.manifest.created_at };
  if (!fs.existsSync(campaignBindingPath)) durableJson(campaignBindingPath, campaignBinding);
  else expect(canonicalJson(readJson(campaignBindingPath)) === canonicalJson(campaignBinding),
    "MEASUREMENT_RESUME", "campaign directory is bound to another manifest");
  const oauthState = initializeCredentialState(campaignRoot, options.opencodeAuth);
  const credentialStore = createBenchmarkV3ProviderCredentialStore({ OPENAI_OAUTH_STATE_FILE: oauthState,
    BENCHMARK_V3_PROVIDER_AUTH_MODE: "oauth" });
  const repositories = { "public-eslint": statDirectory(options.publicRepository, "public repository") };
  for (const repository of Object.keys(PILOT_ADAPTERS)) repositories[repository] = statDirectory(
    path.join(options.pilotRoot, "sources", `${repository}.git`), `${repository} pilot repository`);
  const pilotRuntimeByRepository = new Map(pilotRuntime.relevant.map((entry) => [entry.repository_id, entry]));
  return Object.freeze({ manifest: frozen.manifest, pilotManifest, pilotArtifact: verifiedPilot.artifact,
    productSourceRoot, coreBundle: product.materialized_core_directory, opencode, publicRuntime,
    pilotRuntimeByRepository, pilotRoot: pilotRuntime.root, campaignRoot, credentialStore, repositories,
    ledger: ledgerAppender(path.join(campaignRoot, "attempt-ledger.jsonl")) });
}

async function runCampaign(options) {
  const frozen = validateMeasurementManifest(options.manifest);
  const campaignRoot = path.resolve(options.campaignRoot);
  const lease = acquireCampaignLease(campaignRoot, frozen.manifest.manifest_fingerprint);
  try {
    const context = campaignContext(options);
    const corpus = loadBenchmarkV3Corpus(context.productSourceRoot); const publicTasks = buildPublicTasks(corpus);
    const pilotTasks = buildPilotTasks(context.pilotManifest, context.pilotArtifact, context.repositories);
    const byDataset = new Map([
      ["validation", publicTasks.filter((task) => task.dataset === "validation")],
      ["development", publicTasks.filter((task) => task.dataset === "development")],
      ["pilot", pilotTasks],
    ]);
    for (const dataset of context.manifest.execution_policy.dataset_order) {
      const tasks = byDataset.get(dataset);
      await runPool(tasks, context.manifest.parallel_pairs, async (task, index) => {
        const pair = await runPair(context, task);
        process.stderr.write(`[${dataset}] ${index + 1}/${tasks.length} ${task.id} plain=${Number(pair.plain.regression_free_task_success)} core=${Number(pair.core.regression_free_task_success)}\n`);
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
          && completed[0].scored_outcome === receipt.value.scored_outcome,
        "MEASUREMENT_REPORT", `${receipt.value.attempt_id} receipt and ledger differ`);
      });
      const scored = values.find((entry) => entry.scored_outcome === true);
      expect(scored !== undefined && values.filter((entry) => entry.scored_outcome === true).length === 1,
        "MEASUREMENT_REPORT", `${dataset}/${id}/${arm} lacks exactly one scored outcome`);
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
  return Object.freeze({ median_duration_ms: median(durations), mean_duration_ms: mean(durations), p90_duration_ms: p90(durations),
    model_turns: outcomes.reduce((sum, entry) => sum + entry.turn_count, 0),
    tool_calls: outcomes.reduce((sum, entry) => sum + entry.tool_call_count, 0),
    tokens: observableTokens ? outcomes.reduce((sum, entry) => sum + entry.tokens, 0) : "not_observable",
    timeout_rate: outcomes.filter((entry) => entry.timeout).length / outcomes.length,
    process_failures: outcomes.filter((entry) => !entry.authentic_process_completion).length,
    core_activation_rate: arm === "core" ? outcomes.filter((entry) => entry.core_activation).length / outcomes.length : null,
    verification: arm === "core" ? Object.freeze({ pass: outcomes.filter((entry) => entry.core_activation).length,
      fail: outcomes.filter((entry) => entry.core_verification_blocked && entry.core_verification_authentic).length,
      unavailable: outcomes.filter((entry) => entry.core_verification_blocked && !entry.core_verification_authentic).length }) : null });
}
function summarizePairs(pairs, label) {
  const plainSuccess = pairs.filter((pair) => pair.plain.regression_free_task_success).length;
  const coreSuccess = pairs.filter((pair) => pair.core.regression_free_task_success).length;
  const candidateOnly = pairs.filter((pair) => !pair.plain.regression_free_task_success && pair.core.regression_free_task_success).length;
  const baselineOnly = pairs.filter((pair) => pair.plain.regression_free_task_success && !pair.core.regression_free_task_success).length;
  const discordant = candidateOnly + baselineOnly;
  const interval = pairedBootstrapInterval(pairs, BOOTSTRAP_RESAMPLES, `${BOOTSTRAP_SEED}:${label}`);
  const plain = armOverhead(pairs, "plain"); const core = armOverhead(pairs, "core");
  const strata = Object.fromEntries(STRATA.map((stratum) => [stratum, summarizePairsDescriptive(
    pairs.filter((pair) => pair.stratum === stratum), `${label}:${stratum}`)]));
  const highMedium = pairs.filter((pair) => ["high", "medium"].includes(pair.core.severity));
  const safety = Object.freeze({
    new_critical_regressions: pairs.filter((pair) => pair.plain.regression_free_task_success && !pair.core.regression_free_task_success && pair.core.severity === "critical").length,
    new_high_medium_regressions: pairs.filter((pair) => pair.plain.regression_free_task_success && !pair.core.regression_free_task_success && ["high", "medium"].includes(pair.core.severity)).length,
    new_unclassified_semantic_regressions: pairs.filter((pair) => pair.plain.regression_free_task_success
      && !pair.core.regression_free_task_success && pair.core.severity === "unclassified").length,
    severity_classification: highMedium.length === 0 ? "not_observable_for_public_families" : "observable",
    high_medium_task_count: highMedium.length,
    plain_high_medium_failures: pairs.filter((pair) => !pair.plain.regression_free_task_success && ["high", "medium"].includes(pair.plain.severity)).length,
    core_high_medium_failures: pairs.filter((pair) => !pair.core.regression_free_task_success && ["high", "medium"].includes(pair.core.severity)).length,
    plain_high_medium_failure_rate: highMedium.length === 0 ? null
      : pairs.filter((pair) => !pair.plain.regression_free_task_success && ["high", "medium"].includes(pair.plain.severity)).length / highMedium.length,
    core_high_medium_failure_rate: highMedium.length === 0 ? null
      : pairs.filter((pair) => !pair.core.regression_free_task_success && ["high", "medium"].includes(pair.core.severity)).length / highMedium.length,
    scope_violations_plain: pairs.filter((pair) => pair.plain.scope_violation).length,
    scope_violations_core: pairs.filter((pair) => pair.core.scope_violation).length,
    core_verification_blocked: pairs.filter((pair) => pair.core.core_verification_blocked).length,
  });
  return Object.freeze({ family_count: pairs.length, plain_successes: plainSuccess, core_successes: coreSuccess,
    plain_success_rate: plainSuccess / pairs.length, core_success_rate: coreSuccess / pairs.length,
    absolute_paired_delta: (coreSuccess - plainSuccess) / pairs.length,
    relative_lift: plainSuccess === 0 ? null : (coreSuccess - plainSuccess) / plainSuccess,
    candidate_only_wins: candidateOnly, baseline_only_wins: baselineOnly, ties: pairs.length - discordant,
    exact_two_sided_mcnemar_p: exactTwoSidedMcNemar(baselineOnly, candidateOnly),
    exact_one_sided_core_greater_p: binomialUpperTail(discordant, candidateOnly),
    paired_95_ci: interval, strata, safety,
    outcomes: Object.freeze({ semantic_success_plain: pairs.filter((pair) => pair.plain.semantic_test_success).length,
      semantic_success_core: pairs.filter((pair) => pair.core.semantic_test_success).length,
      syntax_success_plain: pairs.filter((pair) => pair.plain.syntax_verification_success).length,
      syntax_success_core: pairs.filter((pair) => pair.core.syntax_verification_success).length,
      timeouts_plain: pairs.filter((pair) => pair.plain.timeout).length, timeouts_core: pairs.filter((pair) => pair.core.timeout).length,
      no_change_plain: pairs.filter((pair) => pair.plain.no_change).length, no_change_core: pairs.filter((pair) => pair.core.no_change).length }),
    overhead: Object.freeze({ plain, core, median_duration_ratio: core.median_duration_ms / Math.max(plain.median_duration_ms, 1),
      mean_duration_ratio: core.mean_duration_ms / Math.max(plain.mean_duration_ms, 1),
      additional_turns: core.model_turns - plain.model_turns, additional_tool_calls: core.tool_calls - plain.tool_calls,
      additional_tokens: Number.isSafeInteger(core.tokens) && Number.isSafeInteger(plain.tokens) ? core.tokens - plain.tokens : "not_observable" }) });
}
function summarizePairsDescriptive(pairs, label) {
  const plain = pairs.filter((pair) => pair.plain.regression_free_task_success).length;
  const core = pairs.filter((pair) => pair.core.regression_free_task_success).length;
  const candidateOnly = pairs.filter((pair) => !pair.plain.regression_free_task_success && pair.core.regression_free_task_success).length;
  const baselineOnly = pairs.filter((pair) => pair.plain.regression_free_task_success && !pair.core.regression_free_task_success).length;
  return Object.freeze({ family_count: pairs.length, plain_successes: plain, core_successes: core,
    plain_success_rate: plain / pairs.length, core_success_rate: core / pairs.length,
    absolute_paired_delta: (core - plain) / pairs.length, relative_lift: plain === 0 ? null : (core - plain) / plain,
    candidate_only_wins: candidateOnly, baseline_only_wins: baselineOnly, ties: pairs.length - candidateOnly - baselineOnly,
    paired_95_ci: pairedBootstrapInterval(pairs, BOOTSTRAP_RESAMPLES, `${BOOTSTRAP_SEED}:${label}`) });
}
function decisionLabel(primary) {
  const timeoutDelta = primary.outcomes.timeouts_core / primary.family_count - primary.outcomes.timeouts_plain / primary.family_count;
  const processFailureDelta = (primary.overhead.core.process_failures - primary.overhead.plain.process_failures) / primary.family_count;
  const safetyWorse = primary.safety.new_critical_regressions > 0
    || primary.safety.core_high_medium_failures > primary.safety.plain_high_medium_failures
    || primary.safety.new_unclassified_semantic_regressions > 0
    || primary.safety.scope_violations_core > primary.safety.scope_violations_plain
    || primary.safety.core_verification_blocked > 0;
  const safetyObservable = primary.safety.high_medium_task_count > 0;
  if (primary.absolute_paired_delta >= 0.05 && primary.paired_95_ci[0] > 0
    && primary.exact_one_sided_core_greater_p < 0.05 && safetyObservable && !safetyWorse && timeoutDelta <= 0.05) {
    return "CORE IMPROVES ON PUBLIC VALIDATION BENCHMARK";
  }
  if (primary.absolute_paired_delta < 0 || safetyWorse || timeoutDelta > 0.05 || processFailureDelta > 0.05) return "CORE REGRESSES";
  if (primary.paired_95_ci[0] <= 0 && primary.paired_95_ci[1] >= 0) return "NO CLEAR MEASURABLE DIFFERENCE";
  fail("MEASUREMENT_DECISION_UNDEFINED", "frozen decision conditions do not assign an allowed label to this result");
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
    `- Candidate-only / baseline-only / ties: ${value.candidate_only_wins} / ${value.baseline_only_wins} / ${value.ties}`,
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
    "### Safety and outcome classes",
    "",
    `- New critical / high-medium / unclassified semantic regressions: ${value.safety.new_critical_regressions} / ${value.safety.new_high_medium_regressions} / ${value.safety.new_unclassified_semantic_regressions}`,
    `- High/medium failure rates plain / core: ${value.safety.plain_high_medium_failure_rate === null ? "not_observable" : percentage(value.safety.plain_high_medium_failure_rate)} / ${value.safety.core_high_medium_failure_rate === null ? "not_observable" : percentage(value.safety.core_high_medium_failure_rate)}`,
    `- Severity classification coverage: ${value.safety.severity_classification}`,
    `- Scope violations plain / core: ${value.safety.scope_violations_plain} / ${value.safety.scope_violations_core}`,
    `- Core verification blocked: ${value.safety.core_verification_blocked}`,
    `- Semantic test successes plain / core: ${value.outcomes.semantic_success_plain} / ${value.outcomes.semantic_success_core}`,
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
    `- Core verification pass / fail / unavailable: ${value.overhead.core.verification.pass} / ${value.overhead.core.verification.fail} / ${value.overhead.core.verification.unavailable}`,
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
    ...dataset("Development sensitivity", summary.development_sensitivity, "descriptive sensitivity only"),
    ...dataset("Real-repository pilot", summary.real_repository_pilot, "descriptive directional check only"),
    "## Claim boundary",
    "",
    summary.claim.allowed,
    "",
    ...summary.claim.limitations.map((entry) => `- ${entry}`),
    "",
    "Development and the 29-task real-repository pilot are descriptive sensitivity analyses only and are not pooled with primary inference.",
    "",
    `Materialized core changed regression-free task success relative to plain by ${(100 * primary.absolute_paired_delta).toFixed(2)} percentage points on the frozen 60-family public validation benchmark.`,
    "",
  ].join("\n");
}
function reportCampaign(options) {
  const frozen = validateMeasurementManifest(options.manifest); const campaignRoot = statDirectory(options.campaignRoot, "campaign root");
  const pilotManifest = validateFingerprint(readJson(path.resolve(options.pilotManifest)), "pilot_manifest_fingerprint", "pilot manifest");
  const ledgerFile = statRegular(path.join(campaignRoot, "attempt-ledger.jsonl"), "attempt ledger");
  const ledgerRecords = loadLedger(ledgerFile.path);
  const datasets = {
    validation: loadPairs(campaignRoot, "validation", frozen.manifest.validation_family_ids, frozen.manifest, pilotManifest, ledgerRecords),
    development: loadPairs(campaignRoot, "development", frozen.manifest.development_family_ids, frozen.manifest, pilotManifest, ledgerRecords),
    pilot: loadPairs(campaignRoot, "pilot", frozen.manifest.real_pilot_identity_ids, frozen.manifest, pilotManifest, ledgerRecords),
  };
  const allowedIds = new Map([["validation", new Set(frozen.manifest.validation_family_ids)],
    ["development", new Set(frozen.manifest.development_family_ids)], ["pilot", new Set(frozen.manifest.real_pilot_identity_ids)]]);
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
  const primary = summarizePairs(datasets.validation, "validation");
  const summaryBody = { schema_version: 1, measurement_id: frozen.manifest.measurement_id,
    manifest_fingerprint: frozen.manifest.manifest_fingerprint, pilot_manifest_fingerprint: pilotManifest.pilot_manifest_fingerprint,
    product_source_sha: frozen.manifest.product_source_sha, runner_sha256: frozen.manifest.runner_sha256,
    core_bundle_fingerprint: frozen.manifest.core_bundle_fingerprint, provider: frozen.manifest.provider,
    model: frozen.manifest.model, variant: frozen.manifest.variant, decision_label: decisionLabel(primary),
    primary_validation: primary, development_sensitivity: summarizePairs(datasets.development, "development"),
    real_repository_pilot: summarizePairs(datasets.pilot, "pilot"),
    claim: Object.freeze({ allowed: `On the frozen 60-family public validation benchmark, materialized core changed regression-free task success by ${(100 * primary.absolute_paired_delta).toFixed(2)} percentage points versus plain for openai/gpt-5.6-luna at low.`,
      limitations: Object.freeze(["exact model/provider/variant only", "public ESLint-derived benchmark only", "not model-independent", "not a universal promotion verdict", "real-repository pilot is descriptive only"]) }),
    completed_at: new Date().toISOString() };
  const summary = Object.freeze({ ...summaryBody, summary_fingerprint: fingerprint(summaryBody) });
  durableJson(path.resolve(options.summaryOutput), summary);
  const report = renderReport(summary); fs.writeFileSync(path.resolve(options.reportOutput), report, { encoding: "utf8", flag: "wx", mode: 0o600 });
  const ledgerHashBody = { schema_version: 1, measurement_id: frozen.manifest.measurement_id,
    attempt_ledger_sha256: sha256File(ledgerFile.path), attempt_ledger_size: ledgerFile.stat.size,
    receipt_hashes: DATASETS.flatMap((dataset) => {
      const root = path.join(campaignRoot, "receipts", dataset);
      return fs.readdirSync(root, { recursive: true }).filter((entry) => String(entry).endsWith(".json"))
        .map((entry) => ({ path: `${dataset}/${entry}`, sha256: sha256File(path.join(root, entry)) }));
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

async function selfTest() {
  const containmentRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), "core-public-ab-self-test-"));
  try {
    const workspace = path.join(containmentRoot, "workspace"); const attempt = path.join(containmentRoot, "attempt");
    fs.mkdirSync(workspace); fs.mkdirSync(attempt);
    const socketPath = `/private/tmp/core-ab-${process.pid}-${randomBytes(12).toString("base64url")}.sock`;
    const profile = path.join(containmentRoot, "model.sb");
    fs.writeFileSync(profile, modelSandboxProfile({ workspace, attemptDirectory: attempt,
      opencodePath: process.execPath, providerProxySocket: socketPath }), { mode: 0o600 });
    const compiled = run("/usr/bin/sandbox-exec", ["-f", profile, "/usr/bin/true"]);
    expect(passed(compiled), "MEASUREMENT_SELF_TEST",
      `provider-only model Seatbelt profile does not apply: status=${compiled.status} signal=${compiled.signal} ${compiled.stderr.trim()}`);
    await seatbeltSocketRoundTrip(profile, socketPath, workspace);
  } finally { fs.rmSync(containmentRoot, { recursive: true, force: true }); }
  const schedule = buildSchedule("validation", STRATA.flatMap((stratum) => Array.from({ length: 20 }, (_entry, index) => ({ id: `${stratum}-${index + 1}`, stratum }))));
  expect(STRATA.every((stratum) => {
    const entries = schedule.entries.filter((entry) => entry.stratum === stratum);
    return entries.filter((entry) => entry.order[0] === "plain").length === 10
      && entries.filter((entry) => entry.order[0] === "core").length === 10;
  }), "MEASUREMENT_SELF_TEST", "counterbalancing failed");
  const pairs = Array.from({ length: 60 }, (_entry, index) => ({ stratum: STRATA[Math.floor(index / 20)],
    plain: { regression_free_task_success: index < 30 }, core: { regression_free_task_success: index < 36 } }));
  const first = pairedBootstrapInterval(pairs, 10_000, "self-test"); const second = pairedBootstrapInterval(pairs, 10_000, "self-test");
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
      attempt_binding_fingerprint: binding, scored_outcome: true };
    const receipt = { ...outcomeBody, outcome_fingerprint: fingerprint(outcomeBody) };
    const receiptFile = path.join(receiptRoot, "receipt.json"); durableJson(receiptFile, receipt);
    validateOutcomeReceipt(receipt, receiptFile, { manifest, pilotManifest, dataset: "validation", identityId: "self-test", arm: "plain" });
    let receiptRejected = false;
    try { validateOutcomeReceipt({ ...receipt, scored_outcome: false }, receiptFile,
      { manifest, pilotManifest, dataset: "validation", identityId: "self-test", arm: "plain" }); } catch { receiptRejected = true; }
    expect(receiptRejected, "MEASUREMENT_SELF_TEST", "tampered outcome receipt was accepted");
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
  return Object.freeze({ status: "passed", schedule_fingerprint: schedule.schedule_fingerprint,
    bootstrap_interval: first, exact_two_sided_0_6: exactTwoSidedMcNemar(0, 6), exact_one_sided_6_6: binomialUpperTail(6, 6) });
}

const { values } = parseArgs({ options: {
  mode: { type: "string" },
  "product-source-root": { type: "string" }, "core-bundle": { type: "string" }, opencode: { type: "string" },
  "public-repository": { type: "string" }, "public-runtime": { type: "string" }, output: { type: "string" },
  "pilot-root": { type: "string" }, "pilot-artifact": { type: "string" }, "pilot-public-key": { type: "string" },
  "pilot-runtime-manifest": { type: "string" }, "pilot-manifest": { type: "string" },
  "pilot-manifest-output": { type: "string" }, "manifest": { type: "string" }, "manifest-output": { type: "string" },
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
  else if (values.mode === "prepare-public-runtime") result = preparePublicRuntime(required("public-repository"), required("output"));
  else if (values.mode === "freeze") result = freezeManifests({
    productSourceRoot: required("product-source-root"), coreBundle: required("core-bundle"), opencode: required("opencode"),
    publicRuntime: required("public-runtime"), pilotRoot: required("pilot-root"), pilotArtifact: required("pilot-artifact"),
    pilotPublicKey: required("pilot-public-key"), pilotRuntimeManifest: required("pilot-runtime-manifest"),
    pilotManifestOutput: required("pilot-manifest-output"), manifestOutput: required("manifest-output"),
    timeoutMs: required("timeout-ms"), parallelPairs: required("parallel-pairs"),
  });
  else if (values.mode === "run") result = await runCampaign({ manifest: required("manifest"), pilotManifest: required("pilot-manifest"),
    productSourceRoot: required("product-source-root"), coreBundle: required("core-bundle"), opencode: required("opencode"),
    opencodeAuth: required("opencode-auth"), publicRepository: required("public-repository"), publicRuntime: required("public-runtime"),
    pilotRoot: required("pilot-root"), pilotArtifact: required("pilot-artifact"), pilotPublicKey: required("pilot-public-key"),
    pilotRuntimeManifest: required("pilot-runtime-manifest"), campaignRoot: required("campaign-root") });
  else if (values.mode === "report") result = reportCampaign({ manifest: required("manifest"), pilotManifest: required("pilot-manifest"),
    campaignRoot: required("campaign-root"), summaryOutput: required("summary-output"), reportOutput: required("report-output"),
    ledgerOutput: required("ledger-output") });
  else fail("MEASUREMENT_ARGUMENT", "--mode must be self-test, prepare-public-runtime, freeze, run, or report");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  if (error?.code === "MODEL_ACCESS_REQUIRED") {
    process.stderr.write("MODEL ACCESS REQUIRED\n"); process.exitCode = 78;
  } else {
    process.stderr.write(`${error?.code ?? "MEASUREMENT_UNEXPECTED"}: ${error?.message ?? String(error)}\n`); process.exitCode = 1;
  }
}
