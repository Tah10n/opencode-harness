import { errorPayload } from "./errors.mjs";
import { validateUser } from "./service.mjs";

export function processJob() {
  try {
    validateUser();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorPayload(error) };
  }
}
