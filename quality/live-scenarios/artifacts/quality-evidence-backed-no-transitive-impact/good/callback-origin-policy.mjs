const TRUSTED_CALLBACK_ORIGIN = "https://hooks.example.test";
const CALLBACK_PATH_ROOT = "/callbacks";

export function parseAllowedCallbackTarget(value) {
  let target;
  try {
    target = new URL(String(value));
  } catch {
    throw new TypeError("callback target must be an absolute URL");
  }

  const trustedPath = target.pathname === CALLBACK_PATH_ROOT
    || target.pathname.startsWith(`${CALLBACK_PATH_ROOT}/`);
  if (
    target.origin !== TRUSTED_CALLBACK_ORIGIN
    || target.username !== ""
    || target.password !== ""
    || !trustedPath
  ) {
    throw new RangeError("callback target violates the trusted callback policy");
  }
  return target;
}
