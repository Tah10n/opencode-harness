// Prevent model-runtime configuration from crossing into agent shell processes.
const MODEL_RUNTIME_ENVIRONMENT_KEYS = Object.freeze([
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
  "AWS_ACCESS_KEY_ID",
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_DEFAULT_REGION",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_API_VERSION",
  "AZURE_OPENAI_ENDPOINT",
  "CEREBRAS_API_KEY",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "COHERE_API_KEY",
  "DATABRICKS_HOST",
  "DATABRICKS_TOKEN",
  "DEEPSEEK_API_KEY",
  "FIREWORKS_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GROQ_API_KEY",
  "MISTRAL_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENROUTER_API_KEY",
  "OPENCODE_AUTH_CONTENT",
  "PERPLEXITY_API_KEY",
  "TOGETHER_AI_API_KEY",
  "TOGETHER_API_KEY",
  "VERCEL_AI_GATEWAY_API_KEY",
  "XAI_API_KEY",
]);

const CREDENTIAL_ENVIRONMENT_KEYS = new Set(
  MODEL_RUNTIME_ENVIRONMENT_KEYS,
);

// These values authorize one catalog-bound trusted project-check request.
// They are capabilities rather than provider credentials, but they must never
// cross into a shell process.
const TRUSTED_CHECK_CONTROL_ENVIRONMENT_KEYS = Object.freeze([
  "OPENCODE_QUALITY_BROKER_DIRECTORY",
  "OPENCODE_QUALITY_BROKER_SECRET",
  "OPENCODE_QUALITY_BROKER_TIMEOUT_MS",
  "OPENCODE_QUALITY_CHECK_CGROUP_ROOT",
  "OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_MODE",
  "OPENCODE_QUALITY_CHECK_CGROUP_ATTACH_HELPER",
]);

export async function ModelEnvironmentFirewallPlugin() {
  const inheritedCredentialKeys = Object.keys(process.env)
    .filter((key) => CREDENTIAL_ENVIRONMENT_KEYS.has(key.toUpperCase()));
  return {
    "shell.env": async (_input, output) => {
      if (
        output === null
        || typeof output !== "object"
        || output.env === null
        || typeof output.env !== "object"
        || Array.isArray(output.env)
      ) {
        return;
      }
      const keysToMask = new Set([
        ...MODEL_RUNTIME_ENVIRONMENT_KEYS,
        ...TRUSTED_CHECK_CONTROL_ENVIRONMENT_KEYS,
        ...inheritedCredentialKeys,
        ...Object.keys(output.env).filter(
          (key) => CREDENTIAL_ENVIRONMENT_KEYS.has(key.toUpperCase()),
        ),
      ]);
      for (const key of keysToMask) {
        output.env[key] = "";
      }
    },
  };
}
