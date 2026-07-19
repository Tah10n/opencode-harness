import { parseAllowedCallbackTarget } from "./callback-origin-policy.mjs";

export function registerCallback(value, eventName) {
  const target = parseAllowedCallbackTarget(value);
  return Object.freeze({
    endpoint: target.href,
    event: String(eventName).trim(),
  });
}
