import { errorPayload } from "./errors.mjs";
import { validateUser } from "./service.mjs";

export function handleHttp() {
  try {
    validateUser();
    return { status: 204, body: null };
  } catch (error) {
    return { status: 400, body: errorPayload(error) };
  }
}
