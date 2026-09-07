import { checkSource } from "./config.mjs";

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

export function groundedCitation(citation, contracts) {
  const source = citation && contracts[citation.source];
  const unwrap = (text) => text.replace(/[ \t]*\r?\n[ \t]*/g, " ");
  return typeof source === "string" && typeof citation.quote === "string"
    && citation.quote.trim().length > 0 && unwrap(source).includes(unwrap(citation.quote));
}

// Author confidence and citations describe provenance, never expected-result
// validation. All generated files may run diagnostically, including shared files.
export function acceptHypotheses(hypotheses, contracts) {
  const ids = new Set();
  const unverified = hypotheses.map((hypothesis) => {
    if (typeof hypothesis.id !== "string" || !hypothesis.id || ids.has(hypothesis.id)) throw new Error("ACCEPTANCE_ID_INVALID");
    ids.add(hypothesis.id);
    return { ...hypothesis, source: "generated_hypothesis",
      reason: !groundedCitation(hypothesis.basis, contracts) ? "unsupported_citation"
        : hypothesis.confidence !== "unambiguous" ? "ambiguous_requirement" : "expected_result_unconfirmed" };
  });
  return { accepted: [], unverified };
}

/**
 * Adapters are internal host capabilities, never loaded from project configuration.
 * snapshot() must persist patch bytes and return a stable identifier. verify()
 * runs the entire mandatory suite, including regressions, on every snapshot.
 */
export async function runController({ task, checks, hypotheses, contracts, host, signal }) {
  if (typeof task !== "string" || !task.trim()) throw new Error("TASK_REQUIRED");
  const { unverified } = acceptHypotheses(hypotheses, contracts);
  const allChecks = [...checks, ...hypotheses];
  const sources = new Map(checks.map((c) => [c.id, checkSource(c)]));
  hypotheses.forEach((c) => sources.set(c.id, "generated_hypothesis"));
  if (new Set(allChecks.map((c) => c.id)).size !== allChecks.length) throw new Error("DUPLICATE_CHECK_ID");
  const report = {
    snapshots: [], selected: null, repairs: 0, stopReason: null,
    confirmed: [], unverified, generatedTestsAreHypotheses: true,
    checkSources: Object.fromEntries(sources), passedProjectChecks: [], unresolvedHypotheses: unverified,
    semanticCorrectness: "unproven",
  };
  const stop = (reason) => {
    report.stopReason = reason;
    // Never publish a partially repaired failure in place of the initial draft.
    report.selected ??= report.snapshots[0]?.snapshot ?? null;
    const selected = report.snapshots.find((s) => s.snapshot === report.selected);
    report.passedProjectChecks = (selected?.checks ?? []).filter((r) => r.status === "passed"
      && sources.get(r.id) === "existing_project_check").map((r) => r.id);
    for (const hypothesis of report.unverified) {
      hypothesis.result = selected?.checks.find((r) => r.id === hypothesis.id) ?? null;
      hypothesis.explanation = hypothesis.dispute?.reason ?? "Generated expected result has no independent confirmation; this result cannot authorize production repair.";
    }
    return report;
  };
  try {
  if (signal?.aborted) return stop("cancelled");
  await host.draft(task, signal);
  const original = await host.snapshot("D0");
  report.snapshots.push({ name: "D0", snapshot: original, checks: [] });
  if (signal?.aborted) return stop("cancelled");
  if (checks.length === 0) return stop("no_checks");

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const current = report.snapshots.at(-1);
    const scope = await host.scope(current.snapshot);
    if (!scope.passed) {
      current.scope = scope;
      return stop("scope_violation");
    }
    current.checks = validateResults(await host.verify(current.snapshot, allChecks, signal), allChecks);
    if (signal?.aborted) return stop("cancelled");
    if (environmentFailure(current.checks.filter((r) => checks.some((c) => c.id === r.id)))) return stop("verification_unavailable");
    if (complete(current.checks, checks)) {
      // Assess only after the repair decision is final. Diagnostic assertions
      // never enter the primary session history before a later repair.
      const pending = hypotheses.filter((c) => current.checks.some((r) => r.id === c.id && r.status === "assertion_failed"));
      if (pending.length && host.assess) {
        const repeated = validateResults(await host.verify(current.snapshot, pending, signal), pending);
        current.hypothesisReproduction = repeated;
        if (signal?.aborted) return stop("cancelled");
        const reproducible = pending.filter((c) => repeated.some((r) => r.id === c.id && r.status === "assertion_failed"
          && failureIdentity(r) === failureIdentity(current.checks.find((f) => f.id === c.id))));
        if (reproducible.length) {
          const decision = await host.assess({ task, snapshot: current.snapshot, checks: reproducible,
            failures: repeated.filter((r) => reproducible.some((c) => c.id === r.id)), attempt: attempt + 1 }, signal);
          if (signal?.aborted) return stop("cancelled");
          const seen = new Set();
          const valid = decision && Array.isArray(decision.disputed) && decision.disputed.every((d) => {
            if (!d || typeof d !== "object" || !reproducible.some((c) => c.id === d.id) || seen.has(d.id) || typeof d.reason !== "string"
              || !d.reason.trim() || !groundedCitation(d.basis, contracts)) return false;
            seen.add(d.id); return true;
          });
          current.assessment = decision?.unavailable ? { error: "ASSESSMENT_UNAVAILABLE", detail: decision.unavailable }
            : valid ? decision : { error: "ASSESSMENT_INVALID_OR_UNGROUNDED" };
          if (valid) for (const dispute of decision.disputed) {
            Object.assign(report.unverified.find((c) => c.id === dispute.id), { reason: "disputed_assertion", dispute });
          }
        }
      }
      report.selected = current.snapshot;
      report.confirmed = checks.filter((c) => sources.get(c.id) === "independently_validated_acceptance")
        .map((c) => ({ id: c.id, source: sources.get(c.id), expectedResult: c.expectedResult }));
      return stop("checks_passed");
    }
    // A repair that loses a check known to pass in D0 is rejected, even if it
    // fixes another requirement. Hidden regressions remain evaluator-owned.
    const passedBefore = report.snapshots[0].checks.filter((r) => r.status === "passed" && checks.some((c) => c.id === r.id));
    if (attempt > 0 && passedBefore.some((r) => current.checks.find((c) => c.id === r.id)?.status !== "passed")) {
      return stop("repair_regression");
    }
    const failures = current.checks.filter((r) => r.status === "assertion_failed" && checks.some((c) => c.id === r.id));
    if (failures.length === 0) return stop("requirements_unverified");
    if (attempt === 2) return stop("repair_limit");
    // Reproduce before spending a model call. Infrastructure failures are not
    // actionable assertions, and flaky failures must not drive code changes.
    const failedChecks = checks.filter((c) => failures.some((f) => f.id === c.id));
    const repeated = validateResults(await host.verify(current.snapshot, failedChecks, signal), failedChecks);
    current.reproduction = repeated;
    if (signal?.aborted) return stop("cancelled");
    if (environmentFailure(repeated)) return stop("verification_unavailable");
    if (!repeated.every((r) => r.status === "assertion_failed"
      && failureIdentity(r) === failureIdentity(failures.find((f) => f.id === r.id)))) return stop("failure_not_reproducible");
    const diagnostics = failures.map((failure) => ({
      check: { ...checks.find((c) => c.id === failure.id), source: sources.get(failure.id) }, first: failure,
      reproduced: repeated.find((r) => r.id === failure.id),
    }));
    await host.repair({ task, snapshot: current.snapshot, diagnostics, checks, attempt: attempt + 1 }, signal);
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
