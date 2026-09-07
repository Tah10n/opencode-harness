// Runs as a Node test reporter in the check container. The reporter itself is
// mounted read-only from the installed bundle, not taken from the candidate.
export default async function* report(source) {
  let passed = 0, skipped = 0, truncated = false;
  let stdout = "", stderr = "";
  const failures = [];
  for await (const event of source) {
    if (["test:stdout", "test:stderr"].includes(event.type)) {
      const key = event.type === "test:stdout" ? "stdout" : "stderr";
      const previous = key === "stdout" ? stdout : stderr;
      const next = previous + String(event.data.message ?? "");
      if (Buffer.byteLength(next) > 16_384) truncated = true;
      const bounded = Buffer.from(next).subarray(0, 16_384).toString("utf8");
      if (key === "stdout") stdout = bounded; else stderr = bounded;
    }
    if (event.type === "test:pass" && event.data.details?.type !== "suite") {
      if (event.data.skip || event.data.todo) skipped += 1;
      else passed += 1;
    }
    if (event.type === "test:fail") {
      const error = event.data.details?.error;
      if (error?.failureType === "subtestsFailed") continue;
      failures.push({ name: event.data.name, file: event.data.file, line: event.data.line,
        failureType: error?.failureType, code: error?.cause?.code ?? error?.code,
        message: String(error?.cause?.message ?? error?.message ?? "test failed"),
        stack: String(error?.cause?.stack ?? error?.stack ?? "").slice(0, 8192) });
    }
  }
  const assertions = failures.filter((f) => f.code === "ERR_ASSERTION");
  const status = failures.length ? (assertions.length === failures.length ? "assertion_failed" : "infrastructure_error")
    : passed && !skipped ? "passed" : "not_applicable";
  yield JSON.stringify({ protocol: "verified-change/node-test/1", status, passed, skipped, failures, stdout, stderr, truncated }) + "\n";
}
