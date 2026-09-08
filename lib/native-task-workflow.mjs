const item = properties => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const str = { type: 'string' }, strings = { type: 'array', items: str };
const array = items => ({ type: 'array', items });
export const reviewSchema = item({
  findings: array(item({ id: str, classification: { enum: ['concrete', 'hypothesis'] }, basis: str,
    files: strings, reproduction: str, expected: str })),
  obligations: array(item({ requirement: str, status: { enum: ['delivered', 'missing', 'unverified'] }, evidence: str })),
  unverified: strings, coverageLost: strings,
  checks: array(item({ callID: str, purpose: { enum: ['discriminating', 'preservation', 'documentation'] }, basis: str })),
  verificationFiles: strings,
});
const probeSchema = item({ dispositions: array(item({ id: str, decision: { enum: ['grounded', 'rejected', 'unverified'] },
  basis: str, expectedReason: str, reproductionCallID: str, checkKind: { enum: ['behavior', 'documentation', 'unavailable'] },
  explanation: str })), limitations: strings });
const text = result => result.parts?.filter(p => p.type === 'text').map(p => p.text).join('\n') ?? '';
export function structured(result) {
  if (result.info?.structured_output) return result.info.structured_output;
  const value = text(result).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(value); } catch { throw Error('Incomplete structured stage output'); }
}
export function validateOutput(value, schema) {
  if (schema.enum && !schema.enum.includes(value)) throw Error('Invalid stage disposition');
  if (schema.type === 'string' && typeof value !== 'string') throw Error('Invalid stage text');
  if (schema.type === 'array') {
    if (!Array.isArray(value)) throw Error('Invalid stage list');
    for (const item of value) validateOutput(item, schema.items);
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid stage object');
    for (const key of schema.required) if (!Object.hasOwn(value, key)) throw Error(`Missing stage field: ${key}`);
    if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) throw Error('Unknown stage field');
    for (const [key, child] of Object.entries(schema.properties)) validateOutput(value[key], child);
  }
  return value;
}
export function finalChecks(events, snapshot) {
  const lastMutation = events.findLastIndex(e => e.before !== e.after);
  return events.slice(lastMutation + 1).filter(e => e.tool === 'bash' && e.state === 'completed' && e.exit === 0 &&
    e.before === snapshot.snapshotSha256 && e.after === snapshot.snapshotSha256);
}
function reviewedChecks(review, events, snapshot) {
  const final = finalChecks(events, snapshot);
  const lastMutation = events.findLastIndex(e => e.before !== e.after);
  return review.checks.filter(c => c.basis.trim() && (final.some(e => e.callID === c.callID) ||
    c.purpose === 'documentation' && events.slice(lastMutation + 1).some(e => e.callID === c.callID &&
      ['read', 'glob', 'grep'].includes(e.tool) && e.state === 'completed' && e.after === snapshot.snapshotSha256)));
}
// Only conventional test/document files may change during reproduction. Unknown
// layouts remain unverified rather than silently admitting production edits.
export function productionDiff(snapshot, verificationFiles) {
  if (verificationFiles.some(p => !/^[\w./-]+$/.test(p) || p.split('/').includes('..') || p.startsWith('.') ||
    !(/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p) || /\.md$/.test(p) || /(?:^|\/)(?:test|tests|__tests__)\//.test(p))))
    throw Error('Reproduction file list includes an unsupported test/document path');
  return snapshot.diff.split(/(?=^diff --git )/m).filter(part => {
    const names = /^diff --git a\/(.*?) b\/(.*?)\n/.exec(part);
    return !names || !verificationFiles.includes(names[1]) || !verificationFiles.includes(names[2]);
  }).join('');
}
export function reproducedFailure(event) {
  return event?.tool === 'bash' && event.state === 'completed' && event.exit === 1 &&
    !/command not found|ENOENT|EACCES|permission denied|timed? out|cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError/i.test(event.output) &&
    /not ok\b|AssertionError|\bFAIL(?:ED|URES)?\b|expected[\s\S]*actual/i.test(event.output);
}
// This is sequencing over native sessions, not a repository tool or check runner.
export async function runWorkflow(io) {
  const report = { status: 'incomplete', stages: [], patches: [], remaining: [], limits: [], repairs: 0 };
  const save = () => io.save('result.json', report);
  const capture = label => {
    io.checkActive();
    const snapshot = io.capture();
    if (snapshot.status !== 'captured') throw Error(snapshot.error ?? 'Snapshot unavailable');
    io.save(`${label}.json`, snapshot); io.save(`${label}.patch`, snapshot.diff);
    report.patches.push({ label, snapshotSha256: snapshot.snapshotSha256 }); save();
    return snapshot;
  };
  const stage = async (role, label, prompt, schema) => {
    io.checkActive();
    const start = Date.now();
    const result = await io.prompt(role, prompt, schema);
    io.checkActive();
    io.save(`${label}-messages.json`, await io.messages(role));
    report.stages.push({ label, role, elapsedMs: Date.now() - start, messageID: result.info?.id }); save();
    if (result.info?.error) throw Error(`Native stage error: ${JSON.stringify(result.info.error)}`);
    if (!result.info?.finish || ['length', 'content-filter', 'unknown', 'tool-calls'].includes(result.info.finish))
      throw Error(`Incomplete native stage: ${result.info?.finish ?? 'no finish'}`);
    return schema ? validateOutput(structured(result), schema) : result;
  };
  try {
    const initial = capture('initial');
    await stage('author', 'implementation', `Implement the complete original task below using your normal project instructions and native tools. This session is in a separate delivery worktree seeded from the original checkout. Work only here; never write back to the original checkout. Preserve existing work. Run relevant project checks after your last mutation. Commit or publish only when the original task explicitly authorizes it. A separate review follows automatically.\nOriginal task:\n${initial.task}`);
    let current = capture('D0');
    for (let round = 0; round <= 2; round++) {
      const reviewBefore = current.snapshotSha256;
      const evidence = io.events();
      const review = await stage('reviewer', `review-${round}`, JSON.stringify({
        instruction: 'Review current delivery against ORIGINAL TASK. Inspect sources. Native events, not author claims, establish command execution. Return the required structured report. Empty findings are not completion.',
        originalTask: initial.task, initial, current, toolEvidence: evidence,
        currentSuccessfulCommands: finalChecks(evidence, current), previousDispositions: report.dispositions ?? [],
      }), reviewSchema);
      if (io.capture().snapshotSha256 !== reviewBefore) throw Error('Worktree changed during read-only review');
      if (!Array.isArray(review.findings) || !Array.isArray(review.obligations) || !Array.isArray(review.unverified) || !Array.isArray(review.coverageLost))
        throw Error('Incomplete review report');
      report.review = review;
      report.remaining = review.obligations.filter(o => o.status !== 'delivered');
      report.limits = review.unverified;
      const concrete = [
        ...review.findings.filter(f => f.classification === 'concrete'),
        ...report.remaining.filter(o => o.status === 'missing').map((o, i) => ({ id: `obligation-${i}`, basis: o.requirement, expected: o.requirement, reproduction: o.evidence })),
        ...review.coverageLost.map((basis, i) => ({ id: `coverage-${i}`, basis, expected: 'Preserve the necessary original coverage', reproduction: basis })),
      ];
      if (!concrete.length && !review.coverageLost.length) {
        const checks = reviewedChecks(review, io.events(), current);
        const repairedBehaviorUnchecked = report.repairedBehavior &&
          !['discriminating', 'preservation'].every(p => checks.some(c => c.purpose === p));
        report.status = report.remaining.length || !review.obligations.length || review.unverified.length || !checks.length || repairedBehaviorUnchecked
          ? 'incomplete' : 'reviewed_delivery';
        if (!checks.length) report.limits.push('No reviewer-identified relevant successful native check after the last mutation; checks unverified.');
        if (repairedBehaviorUnchecked) report.limits.push('Repaired behavior lacks reviewer-identified discriminating and preservation checks after last mutation.');
        break;
      }
      if (round === 2) { report.limits.push('Two repair cycles exhausted; unresolved findings remain.'); break; }
      const probeStart = io.events().length;
      io.setProbe?.(review.verificationFiles);
      const disposition = await stage('author', `reproduce-${round + 1}`, JSON.stringify({
        instruction: 'Investigate the concrete review findings before changing production code. Verify each basis in the ORIGINAL TASK or public contract; reject unsupported expectations. Reproduce on current production code using native shell. Add project regression tests when coverage is missing, preserving every prior necessary fixture. For docs, inspect required delivery; no executable test is mandatory. Do not repair production until the next stage. Return actual native bash call IDs; unknown/ambiguous findings remain unverified.',
        originalTask: initial.task, review, candidates: concrete, current,
        allowedVerificationFiles: review.verificationFiles,
      }), probeSchema);
      io.setProbe?.(null);
      if (productionDiff(io.capture(), review.verificationFiles) !== productionDiff(current, review.verificationFiles))
        throw Error('Production changed before reproduction was admitted');
      if (!Array.isArray(disposition.dispositions)) throw Error('Incomplete finding dispositions');
      report.dispositions = disposition.dispositions;
      const probeEvents = io.events().slice(probeStart);
      const grounded = disposition.dispositions.filter(d => concrete.some(f => f.id === d.id) &&
        d.decision === 'grounded' && d.basis?.trim() && d.expectedReason?.trim() &&
        probeEvents.some(e => e.callID === d.reproductionCallID && (d.checkKind === 'documentation'
          ? ['read', 'glob', 'grep'].includes(e.tool) && e.state === 'completed'
          : d.checkKind === 'behavior' && reproducedFailure(e))));
      capture(`reproduction-${round + 1}`);
      if (!grounded.length) {
        report.limits.push('No repair admitted: findings rejected, ambiguous, or lacking executed reproduction.');
        current = io.capture();
        report.review = await stage('reviewer', `disposition-review-${round + 1}`, JSON.stringify({
          instruction: 'Re-review the ACTUAL patch after reproduction and author dispositions. Verify rejected findings against the original task yourself. Check test changes and preserved coverage. No repair was admitted; do not infer completeness.',
          originalTask: initial.task, initial, current, dispositions: report.dispositions, toolEvidence: io.events(),
        }), reviewSchema);
        if (io.capture().snapshotSha256 !== current.snapshotSha256) throw Error('Worktree changed during disposition review');
        report.remaining = report.review.obligations.filter(o => o.status !== 'delivered');
        report.status = 'incomplete';
        break;
      }
      await stage('author', `repair-${round + 1}`, JSON.stringify({
        instruction: 'Repair ONLY the grounded findings below with the smallest production change. Preserve all prior necessary tests/fixtures. Execute discriminating checks and relevant preservation checks after the LAST edit. Inspect the final test diff for lost old coverage. Report unavailable checks honestly. Do not use a failing assertion as independent proof of its expected value. Do not address ambiguous findings automatically.',
        originalTask: initial.task, grounded, limitations: disposition.limitations,
      }));
      report.repairedBehavior ||= grounded.some(d => d.checkKind === 'behavior');
      report.repairs++;
      current = capture(`D${report.repairs}`);
    }
  } catch (error) {
    report.status = io.aborted() ? 'cancelled' : /Native API failed|Native stage error|Git context unavailable|permissions unavailable/.test(error.message) ? 'environment_error' : 'incomplete';
    report.failure = { category: report.status === 'environment_error' ? 'environment' : report.status === 'cancelled' ? 'interrupted' : 'workflow_protocol', message: error.message };
    report.limits.push(error.message);
  } finally {
    save();
  }
  return report;
}
