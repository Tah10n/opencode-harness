import fs from "node:fs";
import path from "node:path";

const CREDENTIAL_FILE_ENV = "BENCHMARK_V3_CREDENTIAL_FILE";
const PLACEHOLDER = "benchmark-v3-host-credential-bridge";
const OPENAI_API_ORIGIN = "https://api.openai.com";

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
  } finally {
    fs.closeSync(descriptor);
  }
  fs.unlinkSync(target);
  const parent = fs.openSync(path.dirname(target), fs.constants.O_RDONLY);
  try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); } finally { bytes.fill(0); }
  if (parsed?.schema_version !== 1 || parsed.provider !== "openai"
    || typeof parsed.api_key !== "string" || parsed.api_key.length < 16
    || JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(["api_key", "provider", "schema_version"])) {
    throw new Error("benchmark-v3 credential payload is invalid");
  }
  return parsed.api_key;
}

export const BenchmarkV3CredentialBridgePlugin = async () => {
  let apiKey = consumeCredentialFile();
  return {
    auth: {
      provider: "openai",
      loader: async (readAuth) => {
        const auth = await readAuth();
        if (auth?.type !== "api" || auth.key !== PLACEHOLDER || apiKey === null) {
          throw new Error("benchmark-v3 credential bridge authorization is invalid");
        }
        return {
          apiKey: "",
          fetch: async (input, init = {}) => {
            if (apiKey === null) throw new Error("benchmark-v3 credential bridge is disposed");
            approvedOpenAiUrl(input);
            const headers = new Headers(init.headers);
            headers.set("authorization", `Bearer ${apiKey}`);
            const response = await globalThis.fetch(input, { ...init, headers, redirect: "manual" });
            if (response.status >= 300 && response.status < 400) {
              throw new Error("benchmark-v3 provider redirect is forbidden");
            }
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
    dispose: async () => { apiKey = null; },
  };
};
