// No model, benchmark, provider, or platform dependencies. The host owns snapshots
// and executes checks; the model cannot submit a passing result to this controller.
export const CHECK_STATUSES = Object.freeze([
  "passed", "assertion_failed", "infrastructure_error", "timeout", "not_applicable",
]);

function validateResults(results, checks) {
  if (!Array.isArray(results) || results.length !== checks.length) {
    throw new Error("CHECK_RESULTS_INCOMPLETE");
  }
  const seen = new Set();
  for (const result of results) {
    if (!checks.some((check) => check.id === result.id) || seen.has(result.id)
      || !CHECK_STATUSES.includes(result.status)) throw new Error("CHECK_RESULT_INVALID");
    seen.add(result.id);
  }
  return results;
}

function complete(results, checks) {
  return checks.every((check) => results.find((r) => r.id === check.id)?.status === "passed");
}

function environmentFailure(results) {
  return results.some((r) => ["infrastructure_error", "timeout"].includes(r.status));
}

function failureIdentity(result) {
  return JSON.stringify(result.assertions?.map((a) => ({ name: a.name, file: a.file,
    line: a.line, code: a.code, message: a.message })) ?? [result.stdout, result.stderr]);
}

/**
 * Hypotheses must carry a literal citation supplied by the author before D0.
 * A citation alone is not semantic proof: ambiguous author judgments are excluded.
 * The host retains these judgments in the report rather than claiming an oracle.
 */
export function acceptHypotheses(hypotheses, contracts) {
  const accepted = [];
  const unverified = [];
  const ids = new Set();
  for (const hypothesis of hypotheses) {
    if (typeof hypothesis.id !== "string" || !hypothesis.id || ids.has(hypothesis.id)) {
      throw new Error("ACCEPTANCE_ID_INVALID");
    }
    ids.add(hypothesis.id);
    const citation = hypothesis.basis;
    const source = citation && contracts[citation.source];
    // Prose may be line-wrapped by the user or the author. Preserve inline
    // whitespace and punctuation while allowing equivalent wrapped quotations.
    const unwrap = (text) => text.replace(/[ \t]*\r?\n[ \t]*/g, " ");
    const grounded = typeof source === "string" && typeof citation.quote === "string"
      && citation.quote.trim().length > 0 && unwrap(source).includes(unwrap(citation.quote));
    if (!grounded || hypothesis.confidence !== "unambiguous") {
      unverified.push({ ...hypothesis, reason: grounded ? "ambiguous_requirement" : "unsupported_citation" });
    } else {
      accepted.push(hypothesis);
    }
  }
  const fileKeys = (check) => (check.files ?? []).map((file) => check.cwd ? `${check.cwd}/${file}` : file);
  const quarantined = new Set(unverified.flatMap(fileKeys));
  let executable = accepted;
  let changed;
  do {
    changed = false;
    executable = executable.filter((check) => {
      if (!fileKeys(check).some((file) => quarantined.has(file))) return true;
      unverified.push({ ...check, reason: "shares_file_with_unverified_assertions" });
      fileKeys(check).forEach((file) => quarantined.add(file));
      changed = true;
      return false;
    });
  } while (changed);
  return { accepted: executable, unverified };
}

/**
 * Adapters are internal host capabilities, never loaded from project configuration.
 * snapshot() must persist patch bytes and return a stable identifier. verify()
 * runs the entire mandatory suite, including regressions, on every snapshot.
 */
export async function runController({ task, checks, hypotheses, contracts, host, signal }) {
  if (typeof task !== "string" || !task.trim()) throw new Error("TASK_REQUIRED");
  const { accepted, unverified } = acceptHypotheses(hypotheses, contracts);
  let allChecks = [...checks, ...accepted];
  const assessed = new Set();
  if (new Set(allChecks.map((c) => c.id)).size !== allChecks.length) throw new Error("DUPLICATE_CHECK_ID");
  const report = {
    snapshots: [], selected: null, repairs: 0, stopReason: null,
    confirmed: [], unverified, generatedTestsAreHypotheses: true,
  };
  const stop = (reason) => {
    report.stopReason = reason;
    // Never publish a partially repaired failure in place of the initial draft.
    report.selected ??= report.snapshots[0]?.snapshot ?? null;
    return report;
  };
  try {
  if (signal?.aborted) return stop("cancelled");
  await host.draft(task, signal);
  const original = await host.snapshot("D0");
  report.snapshots.push({ name: "D0", snapshot: original, checks: [] });
  if (signal?.aborted) return stop("cancelled");
  if (allChecks.length === 0) return stop("no_checks");

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const current = report.snapshots.at(-1);
    const scope = await host.scope(current.snapshot);
    if (!scope.passed) {
      current.scope = scope;
      return stop("scope_violation");
    }
    current.checks = validateResults(await host.verify(current.snapshot, allChecks, signal), allChecks);
    if (signal?.aborted) return stop("cancelled");
    if (environmentFailure(current.checks)) return stop("verification_unavailable");
    if (complete(current.checks, allChecks)) {
      report.selected = current.snapshot;
      report.confirmed = accepted.filter((c) => allChecks.includes(c)).map((c) => ({ id: c.id, basis: c.basis }));
      return stop("checks_passed");
    }
    // A repair that loses a check known to pass in D0 is rejected, even if it
    // fixes another requirement. Hidden regressions remain evaluator-owned.
    const passedBefore = report.snapshots[0].checks.filter((r) => r.status === "passed" && allChecks.some((c) => c.id === r.id));
    if (attempt > 0 && passedBefore.some((r) => current.checks.find((c) => c.id === r.id)?.status !== "passed")) {
      return stop("repair_regression");
    }
    let failures = current.checks.filter((r) => r.status === "assertion_failed" && allChecks.some((c) => c.id === r.id));
    if (failures.length === 0) return stop("requirements_unverified");
    if (attempt === 2) return stop("repair_limit");
    // Reproduce before spending a model call. Infrastructure failures are not
    // actionable assertions, and flaky failures must not drive code changes.
    const failedChecks = allChecks.filter((c) => failures.some((f) => f.id === c.id));
    const repeated = validateResults(await host.verify(current.snapshot, failedChecks, signal), failedChecks);
    current.reproduction = repeated;
    if (signal?.aborted) return stop("cancelled");
    if (environmentFailure(repeated)) return stop("verification_unavailable");
    if (!repeated.every((r) => r.status === "assertion_failed"
      && failureIdentity(r) === failureIdentity(failures.find((f) => f.id === r.id)))) return stop("failure_not_reproducible");
    const pending = accepted.filter((c) => failures.some((f) => f.id === c.id) && !assessed.has(c.id));
    if (pending.length) {
      if (!host.assess) throw new Error("ASSESSMENT_REQUIRED");
      const decision = await host.assess({ task, snapshot: current.snapshot, checks: pending,
        failures: failures.filter((f) => pending.some((c) => c.id === f.id)), attempt: attempt + 1 }, signal);
      if (signal?.aborted) return stop("cancelled");
      if (!decision || !Array.isArray(decision.disputed)) throw new Error("ASSESSMENT_INVALID");
      const seen = new Set();
      for (const dispute of decision.disputed) {
        if (!pending.some((c) => c.id === dispute.id) || seen.has(dispute.id)
          || typeof dispute.reason !== "string" || !dispute.reason.trim()) throw new Error("ASSESSMENT_INVALID");
        seen.add(dispute.id);
        const grounded = acceptHypotheses([{ id: dispute.id, confidence: "unambiguous", basis: dispute.basis }], contracts);
        if (!grounded.accepted.length) throw new Error("ASSESSMENT_UNGROUNDED");
      }
      current.assessment = decision;
      pending.forEach((c) => assessed.add(c.id));
      const reconsidered = acceptHypotheses(accepted.map((c) => seen.has(c.id)
        ? { ...c, confidence: "ambiguous" } : c), contracts);
      const removed = new Set(reconsidered.unverified.map((c) => c.id));
      for (const check of reconsidered.unverified) {
        if (!report.unverified.some((c) => c.id === check.id)) report.unverified.push({ ...check,
          reason: seen.has(check.id) ? "disputed_assertion" : check.reason,
          dispute: decision.disputed.find((d) => d.id === check.id) });
      }
      allChecks = allChecks.filter((c) => !removed.has(c.id));
      failures = failures.filter((f) => allChecks.some((c) => c.id === f.id));
      if (!failures.length) {
        if (!allChecks.length || !complete(current.checks, allChecks)) return stop("requirements_unverified");
        report.selected = current.snapshot;
        report.confirmed = accepted.filter((c) => allChecks.includes(c)).map((c) => ({ id: c.id, basis: c.basis }));
        return stop("checks_passed");
      }
    }
    const diagnostics = failures.map((failure) => ({
      check: allChecks.find((c) => c.id === failure.id), first: failure,
      reproduced: repeated.find((r) => r.id === failure.id),
    }));
    await host.repair({ task, snapshot: current.snapshot, diagnostics, checks: allChecks, unverified: report.unverified, attempt: attempt + 1 }, signal);
    report.repairs += 1;
    const name = `D${attempt + 1}`;
    const snapshot = await host.snapshot(name);
    report.snapshots.push({ name, snapshot, checks: [] });
    if (signal?.aborted) return stop("cancelled");
  }
  throw new Error("UNREACHABLE");
  } catch (error) {
    if (signal?.aborted && error?.name === "AbortError") return stop("cancelled");
    throw error;
  }
}
