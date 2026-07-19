const TRUSTED_CALLBACK_HOST = "hooks.example.test";

export function parseAllowedCallbackTarget(value) {
  let target;
  try {
    target = new URL(String(value));
  } catch {
    throw new TypeError("callback target must be an absolute URL");
  }

  if (
    target.protocol !== "https:"
    || !target.hostname.endsWith(TRUSTED_CALLBACK_HOST)
    || !target.pathname.startsWith("/callbacks")
  ) {
    throw new RangeError("callback target violates the trusted callback policy");
  }
  return target;
}
