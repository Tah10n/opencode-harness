import fs from "node:fs";
import path from "node:path";

const CREDENTIAL_FILE_ENV = "BENCHMARK_V3_CREDENTIAL_FILE";
const PLACEHOLDER = "benchmark-v3-host-credential-bridge";
const OPENAI_API_ORIGIN = "https://api.openai.com";
const OPENAI_CODEX_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const OAUTH_DUMMY_KEY = "benchmark-v3-oauth-dummy-key";

function exact(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function parseJwtClaims(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  try { return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return undefined; }
}

function residencyFromAccess(token) {
  const claims = parseJwtClaims(token);
  const value = claims?.["https://api.openai.com/auth"]?.chatgpt_compute_residency
    ?? claims?.chatgpt_compute_residency;
  return typeof value === "string" && value !== "no_constraint" && /^[A-Za-z0-9._-]{1,128}$/u.test(value)
    ? value : undefined;
}

function approvedOpenAiUrl(input) {
  let url;
  try { url = new URL(input instanceof Request ? input.url : String(input)); } catch {
    throw new Error("benchmark-v3 provider request URL is invalid");
  }
  if (url.origin !== OPENAI_API_ORIGIN || url.username !== "" || url.password !== ""
    || !(url.pathname === "/v1" || url.pathname.startsWith("/v1/"))) {
    throw new Error("benchmark-v3 provider request escaped the approved OpenAI API origin");
  }
  return url;
}

function approvedOAuthRequest(input) {
  const url = approvedOpenAiUrl(input);
  if (url.pathname !== "/v1/responses" && url.pathname !== "/v1/chat/completions") {
    throw new Error("benchmark-v3 OAuth request escaped the approved OpenAI response paths");
  }
}

function approvedBrokerUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("benchmark-v3 OAuth broker URL is invalid"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/credential"
    || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== ""
    || !Number.isSafeInteger(Number(url.port)) || Number(url.port) < 1 || Number(url.port) > 65535) {
    throw new Error("benchmark-v3 OAuth broker URL escaped loopback");
  }
  return url.toString();
}

function validateBrokerCredential(value) {
  if (!exact(value, ["schema_version", "provider", "access", "expires", "accountId"])
    || value.schema_version !== 1 || value.provider !== "openai"
    || typeof value.access !== "string" || value.access.length < 16 || value.access.length > 32 * 1024
    || !Number.isSafeInteger(value.expires) || value.expires <= Date.now()
    || typeof value.accountId !== "string" || value.accountId.length < 1 || value.accountId.length > 1024
    || /[\u0000-\u001f\u007f]/u.test(value.accountId)) {
    throw new Error("benchmark-v3 OAuth broker response is invalid");
  }
  return Object.freeze({ access: value.access, expires: value.expires, accountId: value.accountId });
}

function consumeCredentialFile() {
  const target = process.env[CREDENTIAL_FILE_ENV];
  delete process.env[CREDENTIAL_FILE_ENV];
  if (typeof target !== "string" || !path.isAbsolute(target)) throw new Error("benchmark-v3 credential file is unavailable");
  const descriptor = fs.openSync(target, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1 || (typeof process.getuid === "function" && stat.uid !== process.getuid())
      || (stat.mode & 0o077) !== 0 || stat.size < 1 || stat.size > 64 * 1024) {
      throw new Error("benchmark-v3 credential file is not a private bounded ordinary file");
    }
    bytes = fs.readFileSync(descriptor);
    fs.writeSync(descriptor, Buffer.alloc(bytes.length), 0, bytes.length, 0);
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  fs.unlinkSync(target);
  const parent = fs.openSync(path.dirname(target), fs.constants.O_RDONLY);
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); } finally { bytes.fill(0); }
  if (parsed?.schema_version === 1 && parsed.provider === "openai"
    && typeof parsed.api_key === "string" && parsed.api_key.length >= 16
    && exact(parsed, ["api_key", "provider", "schema_version"])) {
    return Object.freeze({ mode: "api", api_key: parsed.api_key });
  }
  if (parsed?.schema_version === 2 && parsed.provider === "openai"
    && typeof parsed.broker_capability === "string" && /^[A-Za-z0-9_-]{43}$/u.test(parsed.broker_capability)
    && exact(parsed, ["schema_version", "provider", "broker_url", "broker_capability"])) {
    return Object.freeze({ mode: "oauth", broker_url: approvedBrokerUrl(parsed.broker_url),
      broker_capability: parsed.broker_capability });
  }
  throw new Error("benchmark-v3 credential payload is invalid");
}

async function requestOAuthCredential(credential) {
  const response = await globalThis.fetch(credential.broker_url, { method: "POST", redirect: "manual",
    headers: { authorization: `Bearer ${credential.broker_capability}` } });
  if (!response.ok || (response.status >= 300 && response.status < 400)) {
    throw new Error(`benchmark-v3 OAuth broker rejected credential request with status ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2 || bytes.length > 64 * 1024) {
    bytes.fill(0);
    throw new Error("benchmark-v3 OAuth broker response is not bounded");
  }
  try { return validateBrokerCredential(JSON.parse(bytes.toString("utf8"))); }
  finally { bytes.fill(0); }
}

export const BenchmarkV3CredentialBridgePlugin = async () => {
  let credential = consumeCredentialFile();
  return {
    auth: {
      provider: "openai",
      loader: async (readAuth) => {
        const auth = await readAuth();
        if (auth?.type !== "api" || auth.key !== PLACEHOLDER || credential === null) {
          throw new Error("benchmark-v3 credential bridge authorization is invalid");
        }
        if (credential.mode === "oauth") {
          return {
            apiKey: OAUTH_DUMMY_KEY,
            fetch: async (input, init = {}) => {
              if (credential === null || credential.mode !== "oauth") throw new Error("benchmark-v3 credential bridge is disposed");
              approvedOAuthRequest(input);
              const authCredential = await requestOAuthCredential(credential);
              const headers = new Headers(init.headers);
              headers.delete("authorization"); headers.delete("Authorization");
              headers.set("authorization", `Bearer ${authCredential.access}`);
              headers.set("ChatGPT-Account-Id", authCredential.accountId);
              const residency = residencyFromAccess(authCredential.access);
              if (residency) headers.set("x-openai-internal-codex-residency", residency);
              const response = await globalThis.fetch(OPENAI_CODEX_ENDPOINT, { ...init, headers, redirect: "manual" });
              if (response.status >= 300 && response.status < 400) throw new Error("benchmark-v3 provider redirect is forbidden");
              return response;
            },
          };
        }
        return {
          apiKey: "",
          fetch: async (input, init = {}) => {
            if (credential === null || credential.mode !== "api") throw new Error("benchmark-v3 credential bridge is disposed");
            approvedOpenAiUrl(input);
            const headers = new Headers(init.headers);
            headers.set("authorization", `Bearer ${credential.api_key}`);
            const response = await globalThis.fetch(input, { ...init, headers, redirect: "manual" });
            if (response.status >= 300 && response.status < 400) throw new Error("benchmark-v3 provider redirect is forbidden");
            return response;
          },
        };
      },
      methods: [],
    },
    "shell.env": async (_input, output) => {
      if (!output?.env || typeof output.env !== "object" || Array.isArray(output.env)) {
        throw new Error("benchmark-v3 shell environment boundary is invalid");
      }
      output.env.OPENAI_API_KEY = "";
      output.env.OPENCODE_AUTH_CONTENT = "";
      output.env[CREDENTIAL_FILE_ENV] = "";
    },
    dispose: async () => { credential = null; },
  };
};
