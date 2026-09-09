const item = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const str = description => ({ type: 'string', description });
const array = (items, description) => ({ type: 'array', items, description });
const strings = description => array(str(description), description);
const choice = (values, description) => ({ type: 'string', enum: values, description });
export const reviewSchema = item({
  findings: array(item({ id: str('Stable finding ID'), classification: choice(['concrete', 'hypothesis'], 'Evidence strength'),
    kind: choice(['behavior', 'test', 'documentation', 'unresolved'], 'Behavior defect or missing delivery; unresolved requires substantive investigation'),
    basis: str('Original requirement or public contract establishing the obligation'),
    affectedFiles: strings('Affected source paths; these never grant write permission'),
    verification: str('How the author can verify the finding'), expected: str('Required behavior and its basis; required for behavior findings'),
  }, ['id', 'classification', 'kind', 'basis', 'affectedFiles']), 'Defects and explicit missing deliverables'),
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
class ReviewCompatibilityError extends Error {}
// One supported legacy review shape. Rename only; never infer finding meaning.
// Missing legacy kind stays unresolved until the evidence-bearing probe stage.
export function adaptReview(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const legacy = Object.hasOwn(value, 'verificationFiles') || value.findings?.some?.(f => f && (Object.hasOwn(f, 'files') || Object.hasOwn(f, 'reproduction')));
  if (!legacy) return value;
  const renamed = (object, old, current) => {
    const copy = { ...object };
    if (Object.hasOwn(copy, old)) {
      if (Object.hasOwn(copy, current) && JSON.stringify(copy[old]) !== JSON.stringify(copy[current]))
        throw new ReviewCompatibilityError(`Review compatibility conflict: ${old} and ${current}`);
      copy[current] = copy[old]; delete copy[old];
    }
    return copy;
  };
  const converted = renamed(value, 'verificationFiles', 'proposedVerificationFiles');
  if (Array.isArray(value.findings)) converted.findings = value.findings.map(f => {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
    const finding = renamed(renamed(f, 'files', 'affectedFiles'), 'reproduction', 'verification');
    if (!Object.hasOwn(finding, 'kind')) finding.kind = 'unresolved';
    return finding;
  });
  // This new category had no separate entries in the legacy schema. Existing
  // material unverified entries remain exactly where they were.
  if (!Object.hasOwn(converted, 'evidenceLimitations')) converted.evidenceLimitations = [];
  return converted;
}
function reviewInput(result) {
  let value;
  try { value = structured(result); }
  catch (error) {
    // Retained legacy text also used trailing commas. The existing quote-aware
    // scanner accepts only that punctuation defect, without executing text.
    value = formatSource(text(result));
    if (!value || !Object.hasOwn(value, 'verificationFiles')) throw error;
  }
  return adaptReview(value);
}
export function conserveFormat(original, corrected, schema) {
  const source = schema === reviewSchema ? adaptReview(formatSource(original)) : formatSource(original);
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const preserve = (a, b, keys) => { for (const key of keys)
    if (!same(a[key], b[key])) throw Error(`Format correction changed or invented ${key}`); };
  if (schema === reviewSchema) {
    preserve(source, corrected, ['obligations', 'coverageLost', 'checks', 'unverified']);
    if (!Array.isArray(source.obligations) || !Array.isArray(source.unverified) || !Array.isArray(source.coverageLost))
      throw Error('Format correction cannot invent missing review meaning');
    if (!same(source.evidenceLimitations ?? [], corrected.evidenceLimitations)) throw Error('Format correction changed provenance limitations');
    if (!Array.isArray(source.findings) || source.findings.length !== corrected.findings.length) throw Error('Format correction changed findings');
    source.findings.forEach((f, i) => {
      const c = corrected.findings[i];
      preserve(f, c, ['id', 'classification', 'basis', 'expected']);
      if (f.kind !== c.kind) throw Error('Format correction changed finding kind');
      if (!same(f.affectedFiles ?? f.files, c.affectedFiles)) throw Error('Format correction changed affected files');
      if (f.verification !== undefined && f.verification !== c.verification || f.reproduction !== undefined && f.reproduction !== c.verification)
        throw Error('Format correction changed verification method');
      if (c.kind === 'behavior' && !f.expected) throw Error('Format correction invented expected behavior');
    });
    if (!same(source.proposedVerificationFiles ?? source.verificationFiles, corrected.proposedVerificationFiles)) throw Error('Format correction changed write proposals');
  } else if (schema === probeSchema) {
    preserve(source, corrected, ['limitations']);
    if (!Array.isArray(source.dispositions) || source.dispositions.length !== corrected.dispositions.length) throw Error('Format correction changed dispositions');
    source.dispositions.forEach((d, i) => {
      const c = corrected.dispositions[i];
      preserve(d, c, ['id', 'decision', 'basis', 'expectedReason', 'explanation']);
      if ((d.kind ?? d.checkKind) !== c.kind || (d.evidenceCallID ?? d.reproductionCallID) !== c.evidenceCallID)
        throw Error('Format correction changed admission evidence');
    });
  }
  return corrected;
}
// The checks occur after each native API await, before any model request.
// Registration runs even if cancellation occurred while create was pending.
export async function prepareFormatSession(io) {
  io.checkActive();
  const session = await io.create();
  io.register(session);
  io.checkActive();
  const tools = await io.tools();
  io.checkActive();
  return { session, tools };
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
  if (schema === reviewSchema) for (const f of value.findings) {
    if (f.kind !== 'unresolved' && !f.verification?.trim()) throw Error('Established finding requires verification method');
    if (f.kind === 'behavior' && !f.expected?.trim()) throw Error('Behavior finding requires expected behavior grounded in its basis');
  }
  if (schema === probeSchema) for (const d of value.dispositions)
    if (d.decision === 'grounded' && (!d.kind || !d.expectedReason?.trim() || !d.evidenceCallID?.trim()))
      throw Error('Grounded disposition requires kind, expectedReason and evidenceCallID');
  return value;
}
// Only host observations establish state continuity. A failed pre-execution
// rejection retains before:null; its separate observation must name the same
// captured expected state. All other missing endpoints remain a boundary.
export function stateTransition(event) {
  const known = value => typeof value === 'string' && value.length > 0;
  if (known(event.before) && known(event.after)) return event.before === event.after ? 'unchanged' : 'changed';
  const observed = event.stateObservation;
  if (event.before === null && event.state === 'error' && known(event.after) &&
      observed?.basis === 'host-rejected-before-execution' && observed.snapshot === event.after)
    return 'unchanged';
  return 'unknown';
}
function lastStateBoundary(events) {
  if (events.some(e => e.permissionDenied === true || e.scopeViolation === true || e.cancelled === true)) return events.length;
  return events.findLastIndex(e => stateTransition(e) !== 'unchanged');
}
export function finalChecks(events, snapshot) {
  const lastMutation = lastStateBoundary(events);
  return events.slice(lastMutation + 1).filter(e => e.tool === 'bash' && e.state === 'completed' && e.exit === 0 &&
    e.before === snapshot.snapshotSha256 && e.after === snapshot.snapshotSha256);
}
function reviewedChecks(review, events, snapshot) {
  const final = finalChecks(events, snapshot);
  const lastMutation = lastStateBoundary(events);
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
  if (checks.length !== review.checks.length) limits.push('A reviewer-identified required check is failed, missing or stale.');
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
// OpenCode 1.18.26 native permission error messages. Tool errors expose a
// string, not the internal TaggedError class. Match only its verified envelope.
export function nativePermissionDenial(error) {
  if (typeof error !== 'string') return false;
  if (error === 'The user rejected permission to use this specific tool call.') return true;
  if (error.startsWith('The user rejected permission to use this specific tool call with the following feedback: ')) return true;
  const prefix = 'The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules ';
  if (!error.startsWith(prefix)) return false;
  try {
    const rules = JSON.parse(error.slice(prefix.length));
    return Array.isArray(rules) && rules.some(r => r?.action === 'deny') &&
      rules.every(r => r && typeof r.permission === 'string' && typeof r.pattern === 'string' && ['allow', 'ask', 'deny'].includes(r.action));
  } catch { return false; }
}
// Diagnostic admission decisions over the native journal, never model prose.
export function assessDispositions(candidates, dispositions, events, current, scopeViolation = false) {
  const lastMutation = lastStateBoundary(events);
  const boundaryViolation = scopeViolation || events.some(e => e.permissionDenied === true || e.scopeViolation === true);
  return candidates.map(f => {
    const matches = dispositions.filter(d => d.id === f.id), d = matches[0];
    const reasons = [];
    const eventIndex = events.findIndex(e => e.callID === d?.evidenceCallID);
    const event = events[eventIndex];
    if (boundaryViolation) reasons.push('change_scope_or_permission_violation');
    if (matches.length !== 1) reasons.push('missing_or_duplicate_disposition');
    if (!d || d.decision !== 'grounded' || !d.basis?.trim() || !d.expectedReason?.trim()) reasons.push('expected_basis_unresolved');
    if (d && !(f.kind === d.kind || f.kind === 'unresolved' && ['behavior', 'test', 'documentation'].includes(d.kind) || f.kind === 'delivery' && ['test', 'documentation'].includes(d.kind))) reasons.push('finding_kind_unresolved');
    if (!event) reasons.push('evidence_not_in_current_stage');
    else {
      if (event.before !== current.snapshotSha256 || event.after !== current.snapshotSha256 || eventIndex <= lastMutation) reasons.push('evidence_wrong_file_state');
      if (event.state !== 'completed') reasons.push('command_not_completed');
      else if (/command not found|ENOENT|EACCES|permission denied|timed? out|cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError/i.test(event.output ?? '')) reasons.push('environment_failure');
      else if (d?.kind === 'behavior' && !reproducedFailure(event)) reasons.push('no_executed_failing_assertion');
      else if (d?.kind === 'test' && !(event.tool === 'bash' && event.exit === 0)) reasons.push('no_successful_test_check');
      else if (d?.kind === 'documentation' && !['read', 'glob', 'grep'].includes(event.tool)) reasons.push('no_document_read_evidence');
    }
    const repairable = new Set(['evidence_not_in_current_stage', 'evidence_wrong_file_state', 'no_executed_failing_assertion', 'no_successful_test_check', 'no_document_read_evidence']);
    return { id: f.id, admitted: reasons.length === 0, reasons,
      correctable: reasons.length > 0 && reasons.every(r => repairable.has(r)),
      disposition: d, evidence: event ? { callID: event.callID, tool: event.tool, state: event.state, exit: event.exit, before: event.before, after: event.after } : null };
  });
}
export const currentEvidence = events => events.map(e => ({ callID: e.callID, tool: e.tool, state: e.state, exit: e.exit,
  before: e.before, after: e.after, command: e.args?.command }));
// This is sequencing over native sessions, not a repository tool or check runner.
export async function runWorkflow(io, { initialReview, maxRepairs = 2 } = {}) {
  if (![0, 1, 2].includes(maxRepairs)) throw Error('Invalid repair limit');
  const report = { status: 'incomplete', stages: [], patches: [], remaining: [], limits: [], repairs: 0, evidenceCorrections: 0, admissions: [] };
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
    try {
      const value = schema === reviewSchema ? reviewInput(result) : structured(result);
      if (schema === reviewSchema) io.save(`${label}-adapted.json`, value);
      return validateOutput(value, schema);
    }
    catch (error) {
      if (error instanceof ReviewCompatibilityError) throw error;
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
      let disposition = await stage('author', `reproduce-${round + 1}`, JSON.stringify({
        instruction: 'Investigate the concrete review findings before changing production code. Verify each basis in the ORIGINAL TASK or public contract; reject unsupported expectations. Reproduce on current production code using native shell. Add project regression tests when coverage is missing, preserving every prior necessary fixture. For missing test delivery add the required regression and run it: passing on correct D0 is valid. Run final checks in a separate native call after the last write, including test/document writes. For docs add/inspect required delivery; no executable test is mandatory. Do not repair production until the next stage. Return actual native evidenceCallID and kind for grounded dispositions; unknown/ambiguous findings remain unverified.',
        originalTask: initial.task, review, historicalChecks: review.checks,
        evidenceNotice: 'Review check IDs are historical context, not evidence for this reproduction. Cite the HOST_NATIVE_EVIDENCE reference returned by a current tool. A printed result is not a failing assertion.',
        candidates: concrete, current,
        allowedVerificationFiles: scope.allowed, rejectedWriteProposals: scope.rejected,
      }), probeSchema);
      const assess = () => {
        const snapshot = io.capture();
        const violation = productionDiff(snapshot, scope.allowed) !== productionDiff(current, scope.allowed);
        const decisions = assessDispositions(concrete, disposition.dispositions, io.events().slice(probeStart), snapshot, violation);
        report.admissions.push({ stage: `reproduce-${round + 1}`, correction: report.evidenceCorrections, decisions });
        save();
        if (violation) throw Error('Production changed before reproduction was admitted');
        return decisions;
      };
      let decisions = assess();
      io.checkActive();
      if (!report.evidenceCorrections && decisions.some(d => d.correctable) &&
        !decisions.some(d => !d.admitted && !d.correctable)) {
        report.evidenceCorrections++;
        disposition = await stage('author', `reproduce-${round + 1}-evidence-correction`, JSON.stringify({
          instruction: 'Correct reproduction evidence once in this SAME author session. The host rejected the evidence for the reasons below. Use only the ORIGINAL TASK/public contract to justify expected behavior. Add and execute a grounded regression if needed; printing a value is not a failing assertion. Production edits remain forbidden. Preserve all findings and prior tests. Return dispositions for every candidate with the actual current HOST_NATIVE_EVIDENCE callID. Do not replace historical IDs by guessing. If expected behavior cannot be established, return unverified. No further evidence correction is allowed.',
          originalTask: initial.task, candidates: concrete, review, historicalChecks: review.checks,
          admissionDecisions: decisions, currentEvents: currentEvidence(io.events().slice(probeStart)),
          current: io.capture(), allowedVerificationFiles: scope.allowed, rejectedWriteProposals: scope.rejected,
        }), probeSchema);
        decisions = assess();
      }
      io.setProbe?.(null);
      report.dispositions = disposition.dispositions;
      if (decisions.some(d => d.reasons.includes('missing_or_duplicate_disposition')))
        throw Error('Reproduction omitted or duplicated a candidate disposition; unresolved findings retained in admissions');
      const grounded = decisions.filter(d => d.admitted).map(d => d.disposition);
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
