const item = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const str = description => ({ type: 'string', description });
const array = (items, description) => ({ type: 'array', items, description });
const strings = description => array(str(description), description);
const choice = (values, description) => ({ type: 'string', enum: values, description });
export const reviewSchema = item({
  findings: array(item({ id: str('Stable finding ID'), classification: choice(['concrete', 'hypothesis'], 'Evidence strength'),
    kind: choice(['behavior', 'test', 'documentation'], 'Behavior defect or missing delivery'),
    basis: str('Original requirement or public contract establishing the obligation'),
    affectedFiles: strings('Affected source paths; these never grant write permission'),
    verification: str('How the author can verify the finding'), expected: str('Required behavior and its basis; required for behavior findings'),
  }, ['id', 'classification', 'kind', 'basis', 'affectedFiles', 'verification']), 'Defects and explicit missing deliverables'),
  obligations: array(item({ requirement: str('Explicit original obligation'), status: choice(['delivered', 'missing', 'unverified'], 'Delivery evidence'), evidence: str('Concrete source/check evidence') }), 'Every original obligation'),
  unverified: strings('Specific unresolved behavior, consumer, required check or ambiguity; blocks completion'),
  evidenceLimitations: strings('Evidence provenance caveats only; not unresolved obligations'),
  coverageLost: strings('Necessary original test cases removed without equivalent coverage'),
  checks: array(item({ callID: str('Actual native tool call ID'), purpose: choice(['discriminating', 'preservation', 'documentation'], 'What this executed check establishes'), basis: str('Why this check is relevant') }), 'Relevant checks on current state'),
  proposedVerificationFiles: strings('Optional proposed test/document writes; host may reject a proposal without discarding findings'),
});
export const probeSchema = item({ dispositions: array(item({ id: str('Reviewed finding ID'), decision: choice(['grounded', 'rejected', 'unverified'], 'Whether original requirement and evidence support action'),
  basis: str('Original task or public contract basis'), explanation: str('Reason for this disposition'),
  expectedReason: str('Why the expected result follows from that basis'), evidenceCallID: str('Actual native check/read call ID'),
  kind: choice(['behavior', 'test', 'documentation'], 'Evidence and delivery kind'),
}, ['id', 'decision', 'basis', 'explanation']), 'One disposition per candidate; grounded requires kind, expectedReason and evidenceCallID'), limitations: strings('Unresolved limitations') });
const text = result => result.parts?.filter(p => p.type === 'text').map(p => p.text).join('\n') ?? '';
export function structured(result) {
  if (result.info?.structured) return result.info.structured;
  if (result.info?.structured_output) return result.info.structured_output;
  const value = text(result).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(value); } catch { throw Error('Incomplete structured stage output'); }
}
// Used only to conserve already supplied meaning during format repair. Final
// output must still parse strictly. This scanner never executes model text.
export function formatSource(raw) {
  const value = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  let clean = '', quoted = false, escaped = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (!quoted && c === ',' && /^[\s]*[}\]]/.test(value.slice(i + 1))) continue;
    clean += c;
    if (escaped) { escaped = false; continue; }
    if (quoted && c === '\\') { escaped = true; continue; }
    if (c === '"') quoted = !quoted;
  }
  return JSON.parse(clean);
}
export function conserveFormat(original, corrected, schema) {
  const source = formatSource(original);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (schema === reviewSchema) {
    for (const key of ['obligations', 'coverageLost'])
      if (!Array.isArray(source[key]) || !same(source[key], corrected[key])) throw Error(`Format correction changed or invented ${key}`);
    if (!Array.isArray(source.findings) || source.findings.length !== corrected.findings.length) throw Error('Format correction changed findings');
    source.findings.forEach((f, i) => {
      const c = corrected.findings[i];
      for (const key of ['id', 'classification', 'basis']) if (f[key] !== c[key]) throw Error('Format correction changed finding meaning');
      if (c.kind === 'behavior' && (!f.expected || f.expected !== c.expected)) throw Error('Format correction invented expected behavior');
    });
    if (!Array.isArray(source.unverified) || !same([...source.unverified, ...(source.evidenceLimitations ?? [])].sort(),
      [...corrected.unverified, ...corrected.evidenceLimitations].sort())) throw Error('Format correction dropped or invented evidence limitations');
  } else if (schema === probeSchema) {
    if (!Array.isArray(source.dispositions) || source.dispositions.length !== corrected.dispositions.length) throw Error('Format correction changed dispositions');
    source.dispositions.forEach((d, i) => { for (const key of ['id', 'decision', 'basis', 'expectedReason'])
      if (d[key] !== corrected.dispositions[i][key]) throw Error('Format correction changed disposition meaning'); });
  }
  return corrected;
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
    for (const [key, child] of Object.entries(schema.properties)) if (Object.hasOwn(value, key)) validateOutput(value[key], child);
  }
  if (schema === reviewSchema) for (const f of value.findings)
    if (f.kind === 'behavior' && !f.expected?.trim()) throw Error('Behavior finding requires expected behavior grounded in its basis');
  if (schema === probeSchema) for (const d of value.dispositions)
    if (d.decision === 'grounded' && (!d.kind || !d.expectedReason?.trim() || !d.evidenceCallID?.trim()))
      throw Error('Grounded disposition requires kind, expectedReason and evidenceCallID');
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
// Host policy, independent of affected source paths. Existing native permissions
// still govern every tool; an allowed preparation path never grants permission.
export function verificationPath(p) {
  return typeof p === 'string' && /^[\w./-]+$/.test(p) && !p.startsWith('.') && !p.split('/').includes('..') &&
    !/(?:^|\/)(?:AGENTS|WORKFLOW|SKILL)\.md$/.test(p) &&
    (/(?:^|\/)(?:test|tests|spec|specs|__tests__|docs)\//.test(p) || /(?:[._-](?:test|spec))\.[\w]+$/.test(p) || /\.(?:md|rst)$/.test(p));
}
export function productionDiff(snapshot, verificationFiles) {
  if (verificationFiles.some(p => !verificationPath(p))) throw Error('Host preparation scope contains a non-test/document path');
  return snapshot.diff.split(/(?=^diff --git )/m).filter(part => {
    const names = /^diff --git a\/(.*?) b\/(.*?)\n/.exec(part);
    return !names || !verificationFiles.includes(names[1]) || !verificationFiles.includes(names[2]);
  }).join('');
}
export function determineOutcome(review, events, current, repairedBehavior = false) {
  const checks = reviewedChecks(review, events, current), limits = [...review.unverified];
  if (!checks.length) limits.push('No relevant successful check after the last mutation.');
  if (repairedBehavior && !['discriminating', 'preservation'].every(p => checks.some(c => c.purpose === p)))
    limits.push('Repaired behavior requires final discriminating and preservation checks.');
  const remaining = review.obligations.filter(o => o.status !== 'delivered');
  const unresolved = review.findings.length || review.coverageLost.length || remaining.length || !review.obligations.length || limits.length;
  return { status: unresolved ? 'incomplete' : 'reviewed_delivery', remaining, limits, evidenceLimitations: review.evidenceLimitations };
}
export function reproducedFailure(event) {
  return event?.tool === 'bash' && event.state === 'completed' && event.exit === 1 &&
    !/command not found|ENOENT|EACCES|permission denied|timed? out|cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError/i.test(event.output) &&
    /not ok\b|AssertionError|\bFAIL(?:ED|URES)?\b|expected[\s\S]*actual/i.test(event.output);
}
// This is sequencing over native sessions, not a repository tool or check runner.
export async function runWorkflow(io, { initialReview, maxRepairs = 2 } = {}) {
  if (![0, 1, 2].includes(maxRepairs)) throw Error('Invalid repair limit');
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
  const stage = async (role, label, prompt, schema, supplied) => {
    io.checkActive();
    const start = Date.now();
    const result = supplied ?? await io.prompt(role, prompt, schema);
    io.checkActive();
    io.save(`${label}-original.json`, result);
    if (!supplied) io.save(`${label}-messages.json`, await io.messages(role));
    report.stages.push({ label, role, supplied: !!supplied, elapsedMs: Date.now() - start, messageID: result.info?.id }); save();
    if (result.info?.error) throw Error(`Native stage error: ${JSON.stringify(result.info.error)}`);
    if (!result.info?.finish || ['length', 'content-filter', 'unknown'].includes(result.info.finish) ||
      result.info.finish === 'tool-calls' && !result.info.structured)
      throw Error(`Incomplete native stage: ${result.info?.finish ?? 'no finish'}`);
    if (!schema) return result;
    try { return validateOutput(structured(result), schema); }
    catch (error) {
      io.checkActive();
      const before = io.capture().snapshotSha256, begun = Date.now();
      io.save(`${label}-format-error.json`, { error: error.message });
      const corrected = await io.format({ originalResponse: text(result), schemaError: error.message, schema });
      io.checkActive();
      io.save(`${label}-format-original.json`, corrected);
      report.stages.push({ label: `${label}-format`, role, formatOnly: true, elapsedMs: Date.now() - begun, messageID: corrected.info?.id }); save();
      if (io.capture().snapshotSha256 !== before) throw Error('Format correction changed the patch');
      if (corrected.info?.error || corrected.info?.finish !== 'stop') throw Error('Incomplete format correction');
      // One attempt only. Missing meaning must remain an error, never defaults.
      return conserveFormat(text(result), validateOutput(structured(corrected), schema), schema);
    }
  };
  try {
    const initial = capture('initial');
    if (!initialReview) await stage('author', 'implementation', `Implement the complete original task below using your normal project instructions and native tools. This session is in a separate delivery worktree seeded from the original checkout. Work only here; never write back to the original checkout. Preserve existing work. Run relevant project checks after your last mutation. Commit or publish only when the original task explicitly authorizes it. A separate review follows automatically.\nOriginal task:\n${initial.task}`);
    let current = capture('D0');
    for (let round = 0; round <= maxRepairs; round++) {
      const reviewBefore = current.snapshotSha256;
      const evidence = io.events();
      const review = await stage('reviewer', `review-${round}`, JSON.stringify({
        instruction: 'Review current delivery against ORIGINAL TASK. Inspect sources. Native events, not author claims, establish command execution. Return the required structured report. Empty findings are not completion.',
        originalTask: initial.task, initial, current, toolEvidence: evidence,
        currentSuccessfulCommands: finalChecks(evidence, current), previousDispositions: report.dispositions ?? [],
      }), reviewSchema, round === 0 ? initialReview : undefined);
      if (io.capture().snapshotSha256 !== reviewBefore) throw Error('Worktree changed during read-only review');
      if (!Array.isArray(review.findings) || !Array.isArray(review.obligations) || !Array.isArray(review.unverified) || !Array.isArray(review.coverageLost))
        throw Error('Incomplete review report');
      report.review = review;
      Object.assign(report, determineOutcome(review, io.events(), current, report.repairedBehavior));
      const concrete = [
        ...review.findings.filter(f => f.classification === 'concrete'),
        ...report.remaining.filter(o => o.status === 'missing').map((o, i) => ({ id: `obligation-${i}`, kind: 'delivery', basis: o.requirement, verification: o.evidence })),
        ...review.coverageLost.map((basis, i) => ({ id: `coverage-${i}`, kind: 'test', basis, verification: 'Restore necessary original coverage' })),
      ];
      if (!concrete.length) break;
      if (round === maxRepairs) { report.limits.push('Repair limit exhausted; unresolved findings remain.'); break; }
      const scope = io.verificationScope(review.proposedVerificationFiles);
      report.rejectedWriteProposals = scope.rejected;
      const probeStart = io.events().length;
      io.setProbe?.(scope.allowed);
      const disposition = await stage('author', `reproduce-${round + 1}`, JSON.stringify({
        instruction: 'Investigate the concrete review findings before changing production code. Verify each basis in the ORIGINAL TASK or public contract; reject unsupported expectations. Reproduce on current production code using native shell. Add project regression tests when coverage is missing, preserving every prior necessary fixture. For missing test delivery add the required regression and run it: passing on correct D0 is valid. Run final checks in a separate native call after the last write, including test/document writes. For docs add/inspect required delivery; no executable test is mandatory. Do not repair production until the next stage. Return actual native evidenceCallID and kind for grounded dispositions; unknown/ambiguous findings remain unverified.',
        originalTask: initial.task, review, candidates: concrete, current,
        allowedVerificationFiles: scope.allowed, rejectedWriteProposals: scope.rejected,
      }), probeSchema);
      io.setProbe?.(null);
      if (productionDiff(io.capture(), scope.allowed) !== productionDiff(current, scope.allowed))
        throw Error('Production changed before reproduction was admitted');
      if (!Array.isArray(disposition.dispositions)) throw Error('Incomplete finding dispositions');
      report.dispositions = disposition.dispositions;
      const probeEvents = io.events().slice(probeStart);
      const grounded = disposition.dispositions.filter(d => concrete.some(f => f.id === d.id && (f.kind === d.kind || f.kind === 'delivery' && ['test', 'documentation'].includes(d.kind))) &&
        d.decision === 'grounded' && d.basis?.trim() && d.expectedReason?.trim() &&
        probeEvents.some(e => e.callID === d.evidenceCallID && (d.kind === 'documentation'
          ? ['read', 'glob', 'grep'].includes(e.tool) && e.state === 'completed'
          : d.kind === 'behavior' ? reproducedFailure(e)
          : d.kind === 'test' && finalChecks(probeEvents, io.capture()).some(c => c.callID === e.callID))));
      capture(`reproduction-${round + 1}`);
      const behavior = grounded.filter(d => d.kind === 'behavior');
      if (!behavior.length) {
        report.limits.push(grounded.length ? 'Test/document preparation completed; no production repair needed.' : 'No repair admitted: findings rejected, ambiguous, or lacking executed reproduction.');
        current = io.capture();
        report.review = await stage('reviewer', `disposition-review-${round + 1}`, JSON.stringify({
          instruction: 'Re-review the ACTUAL patch after reproduction and author dispositions. Verify rejected findings against the original task yourself. Check test changes and preserved coverage. No repair was admitted; do not infer completeness.',
          originalTask: initial.task, initial, current, dispositions: report.dispositions, toolEvidence: io.events(),
        }), reviewSchema);
        if (io.capture().snapshotSha256 !== current.snapshotSha256) throw Error('Worktree changed during disposition review');
        report.remaining = report.review.obligations.filter(o => o.status !== 'delivered');
        Object.assign(report, determineOutcome(report.review, io.events(), current, report.repairedBehavior));
        break;
      }
      await stage('author', `repair-${round + 1}`, JSON.stringify({
        instruction: 'Repair ONLY the grounded findings below with the smallest production change. Preserve all prior necessary tests/fixtures. Execute discriminating checks and relevant preservation checks after the LAST edit. Inspect the final test diff for lost old coverage. Report unavailable checks honestly. Do not use a failing assertion as independent proof of its expected value. Do not address ambiguous findings automatically.',
        originalTask: initial.task, grounded: behavior, limitations: disposition.limitations,
      }));
      report.repairedBehavior ||= behavior.length > 0;
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
