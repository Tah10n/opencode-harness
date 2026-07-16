const SAFE_KIND = /^injected-[a-z0-9-]+-test-containment-v1$/u;

export function createInjectedTestContainmentFactory(kind) {
  if (typeof kind !== "string" || !SAFE_KIND.test(kind)) {
    throw new TypeError("injected test containment kind is invalid");
  }
  return async function injectedTestContainmentFactory(worker) {
    let closed = false;
    const identity = Object.freeze({
      schema_version: 1,
      support_state: "verified",
      kind,
      scope_id: `${kind}-${worker.pid}`,
      worker_pid: worker.pid,
    });
    const close = async () => {
      if (closed) return true;
      closed = true;
      try { worker.kill?.(); } catch { /* process close confirmation remains authoritative */ }
      return true;
    };
    return Object.freeze({
      support_state: "verified",
      kind: identity.kind,
      scope_id: identity.scope_id,
      identity,
      fingerprint: `sha256:${"d".repeat(64)}`,
      status: () => Object.freeze({
        support_state: "verified",
        kind: identity.kind,
        scope_id: identity.scope_id,
        teardown_verified: closed,
      }),
      terminateAndVerify: close,
      close,
    });
  };
}
