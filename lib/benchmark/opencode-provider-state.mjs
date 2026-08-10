import {
  ContractError,
  assertExactKeys,
} from "../feedback/contracts.mjs";
import {
  normalizeSyntheticOpenCodeProviderId,
  projectSyntheticOpenCodeAuthContent,
  resolveSyntheticOpenCodeAuthContent,
} from "./profiles.mjs";

export const SYNTHETIC_OPENCODE_CREDENTIAL_BROKER_VERSION = 1;

// This state is runner-owned and intentionally never serialized into reports.

function fail(code, message) {
  throw new ContractError(code, message);
}

function assertProvider(value, expected) {
  let normalized;
  try {
    normalized = normalizeSyntheticOpenCodeProviderId(value);
  } catch {
    fail("SYNTHETIC_CREDENTIAL_PROVIDER", "credential provider is invalid");
  }
  if (normalized.toLowerCase() !== expected.toLowerCase()) {
    fail("SYNTHETIC_CREDENTIAL_PROVIDER", "credential provider does not match the broker binding");
  }
  return expected;
}

function assertRevision(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("SYNTHETIC_CREDENTIAL_REVISION", `${label} must be a non-negative safe integer`);
  }
  return value;
}

export function createSyntheticOpenCodeCredentialBroker({
  providerId,
  sourceEnvironment = process.env,
} = {}) {
  const provider = normalizeSyntheticOpenCodeProviderId(providerId);
  let authContent = null;
  let revision = 0;
  let initializationFailed = false;
  try {
    authContent = resolveSyntheticOpenCodeAuthContent({
      providerId: provider,
      sourceEnvironment,
    });
  } catch {
    initializationFailed = true;
  }

  const handle = async (operation, payload) => {
    if (initializationFailed) {
      fail("SYNTHETIC_CREDENTIAL_SOURCE", "host credential source is unavailable");
    }
    if (operation === "credential_read") {
      assertExactKeys(payload, {
        allowed: ["provider_id"],
        required: ["provider_id"],
      }, "credential read request");
      assertProvider(payload.provider_id, provider);
      return Object.freeze({
        schema_version: SYNTHETIC_OPENCODE_CREDENTIAL_BROKER_VERSION,
        provider_id: provider,
        revision,
        auth_content: authContent,
      });
    }
    if (operation === "credential_update") {
      assertExactKeys(payload, {
        allowed: ["provider_id", "expected_revision", "auth_content"],
        required: ["provider_id", "expected_revision", "auth_content"],
      }, "credential update request");
      assertProvider(payload.provider_id, provider);
      assertRevision(payload.expected_revision, "credential update expected_revision");
      if (payload.expected_revision !== revision) {
        fail("SYNTHETIC_CREDENTIAL_REVISION", "credential update revision is stale");
      }
      let projected;
      try {
        projected = projectSyntheticOpenCodeAuthContent({
          providerId: provider,
          authContent: payload.auth_content,
        });
      } catch {
        fail("SYNTHETIC_CREDENTIAL_CONTENT", "credential update content is invalid");
      }
      if (projected === null) {
        fail("SYNTHETIC_CREDENTIAL_CONTENT", "credential update does not contain the bound provider");
      }
      authContent = projected;
      revision += 1;
      return Object.freeze({
        schema_version: SYNTHETIC_OPENCODE_CREDENTIAL_BROKER_VERSION,
        provider_id: provider,
        revision,
      });
    }
    fail("SYNTHETIC_CREDENTIAL_OPERATION", "credential operation is unsupported");
  };

  return Object.freeze({
    providerId: provider,
    handle,
  });
}
