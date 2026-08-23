import {
  SECRET_MUTATION_DENIAL_CODE,
  secretMutationIntent,
} from "./mutation-path-policy.mjs";

export async function SecretMutationGuardPlugin() {
  return {
    "tool.execute.before": async (input, output) => {
      if (!secretMutationIntent(input?.tool, output?.args)) return;
      const error = new Error(`${SECRET_MUTATION_DENIAL_CODE}: mutation target is outside the non-secret task surface`);
      error.code = SECRET_MUTATION_DENIAL_CODE;
      throw error;
    },
  };
}

export default SecretMutationGuardPlugin;
