import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  checks: array(item({ callID: str('Select the exact short ref from executedChecks; retained native call IDs are also accepted exactly'), purpose: choice(['discriminating', 'preservation', 'documentation'], 'What this executed check establishes'), basis: str('Why this check is relevant') }), 'Relevant checks on current state'),
  proposedVerificationFiles: strings('Optional proposed test/document writes; host may reject a proposal without discarding findings'),
});
export const probeSchema = item({ dispositions: array(item({ id: str('Reviewed finding ID'), decision: choice(['grounded', 'rejected', 'unverified'], 'Whether original requirement and evidence support action'),
  basis: str('Original task or public contract basis'), explanation: str('Reason for this disposition'),
  expectedReason: str('Why the expected result follows from that basis'), evidenceCallID: str('Actual native check/read call ID'),
  kind: choice(['behavior', 'test', 'documentation', 'implementation'], 'implementation only for missing original obligations, never a relabelled behavior finding'),
  affectedFiles: strings('For implementation: current consumer/entry-point paths and concrete missing production work; no write permission is granted by this list'),
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
      preserve(d, c, ['id', 'decision', 'basis', 'expectedReason', 'explanation', 'affectedFiles']);
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
// A per-review projection of the existing workflow log. No lookup by command
// text, no inferred check, and no execution. The namespace prevents selections
// from another workflow/review from naming a different event here.
export function reviewEvidence(events, snapshot, scope) {
  const boundary = lastStateBoundary(events);
  return events.flatMap((event, eventIndex) => ['bash', 'read', 'glob', 'grep'].includes(event.tool) ? [{
    ref: `E${eventIndex + 1}-${scope}`, scope, eventIndex, callID: event.callID,
    tool: event.tool, command: event.args?.command ?? event.args,
    state: event.state, exit: event.exit ?? null,
    before: event.before, after: event.after, snapshotSha256: snapshot.snapshotSha256,
    current: eventIndex > boundary && event.before === snapshot.snapshotSha256 && event.after === snapshot.snapshotSha256,
  }] : []);
}
export function resolveReviewEvidence(review, catalog) {
  const bindings = review.checks.map(check => {
    // Exact native IDs remain readable for existing reports. Ambiguous IDs and
    // unknown short references fail closed, including references from old reviews.
    const matches = catalog.filter(row => row.ref === check.callID || row.callID === check.callID);
    const row = matches.length === 1 && catalog.filter(e => e.callID === matches[0].callID).length === 1 ? matches[0] : null;
    return { selected: check.callID, ...(row ?? { callID: null, eventIndex: null }), resolved: !!row };
  });
  return { review: { ...review, checks: review.checks.map((check, i) => ({ ...check, callID: bindings[i].callID ?? '' })) }, bindings };
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
// Observe only the existing Node project runner route. This is structural test
// evidence, not proof that the author's expectation follows from the task.
export function observeNodeTest(event, directory) {
  if(event.tool!=='bash'||event.state!=='completed'||typeof event.args?.command!=='string')return null;
  let command=event.args.command.trim();
  const cwd=path.resolve(event.args.workdir??directory);
  if(cwd!==path.resolve(directory))return null;
  if(command==='npm test'||command==='npm run test'){
    try{const pkg=JSON.parse(fs.readFileSync(path.join(cwd,'package.json'),'utf8'));
      if(pkg.scripts?.pretest||pkg.scripts?.posttest)return null;
      command=pkg.scripts?.test;
    }catch{return null;}
  }
  // No inline JS, shell chaining, redirection, preload or custom reporter.
  if(typeof command!=='string'||!/^node --test(?: --test-reporter=(?:tap|spec))?(?: [\w./*?-]+\.(?:mjs|cjs|js))*$/.test(command))return null;
  const output=event.output??'';
  const tap=output.startsWith('TAP version 13\n')||output.includes('\nTAP version 13\n');
  const spec=/^ℹ tests \d+$/m.test(output)&&/^ℹ fail [1-9]\d*$/m.test(output);
  if(!tap&&!spec)return {runner:'node:test',failed:false};
  // A test-file import/setup crash has no test callback frame. A hook failure
  // is also not a behavioral check. Merely printing an error cannot pass this.
  // A TAP child result owns only its immediately following diagnostic block.
  // Parent subtestsFailed, siblings and their stacks must never be combined.
  const blocks=[];
  if(tap){
    const lines=output.split('\n');
    for(let i=0;i<lines.length;i++){
      const result=/^( *)(?:not ok) \d+ - /.exec(lines[i]);
      if(!result)continue;
      const indent=result[1]+'  ';
      if(lines[i+1]!==indent+'---')continue;
      let end=i+2;
      while(end<lines.length&&lines[end]!==indent+'...'&&lines[end].startsWith(indent))end++;
      if(lines[end]===indent+'...')blocks.push(lines.slice(i+2,end).map(line=>line.slice(indent.length)).join('\n'));
    }
  }else blocks.push(...output.split(/\ntest at /).slice(1));
  for(const block of blocks){
    if(tap&&(!/^type: 'test'$/m.test(block)||!/^failureType: 'testCodeFailure'$/m.test(block)))continue;
    if(/failureType: '(?:hookFailed|cancelledByParent)'|(?:at )?(?:async )?TestHook\.(?:run|runInAsyncScope)\b/.test(block))continue;
    // Node preserves a named callback as TestContext.<name>. Require that
    // callback frame and the runner invocation, not an arbitrary named stack.
    if(!/^\s*(?:at )?(?:async )?TestContext\.(?:<anonymous>|[^\s().]+) \([^\n]+:\d+:\d+\)$/m.test(block)||
      !/^\s*(?:at )?(?:Test\.runInAsyncScope \(node:async_hooks:\d+:\d+\)|async Test\.run \(node:internal\/test_runner\/test:\d+:\d+\))$/m.test(block))continue;
    const frames=[...block.matchAll(/(?:at |^\s+)(?:[^\n]*?\()?((?:file:\/\/\/|\/)[^\n()]+?):(\d+):(\d+)\)?/gm)];
    const local=frames.map(m=>{try{const file=m[1].startsWith('file:')?fileURLToPath(m[1]):m[1];const relative=path.relative(fs.realpathSync(cwd),fs.realpathSync(file));return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&fs.statSync(file).isFile()?relative:null;}catch{return null;}}).filter(Boolean);
    if(!local.length)continue;
    const assertion=/^\s*code: 'ERR_ASSERTION',?$/m.test(block);
    const productOrigin=!verificationPath(local[0]);
    if(assertion||productOrigin)return {runner:'node:test',failed:event.exit===1,failure:assertion?'assertion':'product-exception',origin:local[0]};
  }
  return {runner:'node:test',failed:false};
}
export function reproducedFailure(event) {
  return event?.tool === 'bash' && event.state === 'completed' && event.exit === 1 && event.nodeTest?.failed === true;
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
    if (d && !(f.kind === d.kind || f.kind === 'unresolved' && ['behavior', 'test', 'documentation'].includes(d.kind) || f.kind === 'delivery' && ['test', 'documentation', 'implementation'].includes(d.kind))) reasons.push('finding_kind_unresolved');
    if(d?.kind === 'implementation' && (!d.explanation?.trim() || !d.affectedFiles?.length || d.affectedFiles.some(p=>typeof p!=='string'||!p.trim())))reasons.push('missing_implementation_scope');
    if (!event) reasons.push('evidence_not_in_current_stage');
    else {
      if (event.before !== current.snapshotSha256 || event.after !== current.snapshotSha256 || eventIndex <= lastMutation) reasons.push('evidence_wrong_file_state');
      if (event.state !== 'completed') reasons.push('command_not_completed');
      else if (!event.nodeTest && /command not found|ENOENT|EACCES|permission denied|timed? out|cannot find module|ERR_MODULE_NOT_FOUND|SyntaxError/i.test(event.output ?? '')) reasons.push('environment_failure');
      else if (d?.kind === 'behavior' && !reproducedFailure(event)) reasons.push('no_executed_failing_assertion');
      else if (d?.kind === 'implementation' && !['read','glob','grep'].includes(event.tool)) reasons.push('no_current_implementation_inspection');
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
  before: e.before, after: e.after, command: e.args?.command, nodeTest: e.nodeTest }));
// Experimental D: one native author session, at most three substantive returns.
// Historical report readers above remain available; none controls this path.
export async function runWorkflow(io) {
  const report = { revision: 'D', status: 'incomplete', stages: [], patches: [], repairs: 0, remaining: [], limits: [] };
  const save = () => io.save('result.json', report);
  const capture = label => {
    io.checkActive();
    const state = io.capture();
    if (state.status !== 'captured') throw Error(state.error ?? 'Snapshot unavailable');
    io.save(`${label}.json`, state); io.save(`${label}.patch`, state.diff);
    report.patches.push({ label, snapshotSha256: state.snapshotSha256 }); save();
    return state;
  };
  const author = async (label, prompt) => {
    io.checkActive();
    const start = Date.now(), result = await io.prompt('author', prompt);
    io.save(`${label}-original.json`, result);
    report.stages.push({ label, role: 'author', elapsedMs: Date.now() - start, messageID: result.info?.id }); save();
    io.checkActive();
    io.save(`${label}-messages.json`, await io.messages('author'));
    io.checkActive();
    if (result.info?.error) throw Error(`Native stage error: ${JSON.stringify(result.info.error)}`);
    if (result.info?.finish !== 'stop') throw Error(`Incomplete native stage: ${result.info?.finish ?? 'no finish'}`);
    return text(result);
  };
  try {
    const initial = capture('initial');
    report.authorSummary = await author('implementation', `Implement the complete original task below using the project instructions and native tools. Work only in this separate delivery worktree seeded from the original checkout; preserve existing user work. Do not apply results back to the original checkout. Commit/publish only if the original task authorizes it. Finish every requested code, regression and documentation obligation. Run the necessary new-behavior and preservation checks after your last edit, in separate tool calls; old suites and whitespace alone cannot establish new behavior. Explain the task/project basis of required versus diagnostic checks before running them. A baseline/environment exception needs an actual check on the corresponding initial state, not an assertion. Preserve necessary existing test scenarios; initialize each independent stateful scenario with compatible data; an intentional change to an expectation does not replace other scenarios. Report actual checks and limitations in ordinary prose.\nOriginal task:\n${initial.task}`);
    let current = capture('D0');
    const observe = label => {
      io.checkActive();
      const observation = io.observe(current);
      io.save(`${label}-observations.json`, observation);
      return observation;
    };
    let observations = observe('D0');
    // Only changed check outcomes or new substantive command evidence count.
    // File hashes and author prose alone (including comments and "done") do not.
    const evidence = facts => JSON.stringify({ reasons: facts.reasons,
      checks: (facts.latestChecks ?? []).map(c => [c.key, c.current, c.exit, c.tests,
        (c.output ?? '').split('\n').filter(line => /^(?:\s*not ok |✖ |error:|  error:|  expected:|  actual:)/.test(line)).map(line => line.replace(/ \([\d.]+m?s\)$/, ''))]) });
    let unchanged = 0;
    const diagnostics = new Set();
    const newDiagnostics = facts => {
      let added = false;
      for (const c of facts.checks ?? []) {
        const key = JSON.stringify([c.key, c.exit, c.tests]);
        if (!diagnostics.has(key)) { diagnostics.add(key); added = true; }
      }
      return added;
    };
    newDiagnostics(observations);
    while (observations.reasons.length && report.repairs < 3) {
      const pass = report.repairs + 1;
      const feedback = {
        instruction: 'Corrective pass in this SAME author session and worktree, within the remaining shared deadline. Address the updated concrete unfinished work below against the ORIGINAL TASK. Finish the requested code and delivered regressions, then run necessary new-behavior and preservation checks after the last edit. A green old suite or whitespace check does not replace a missing requested scenario. Initialize every independent stateful test scenario correctly. Test changes are questions about preserved coverage, not proof of a regression; assess the exact diff once, then work from current facts. Do not restore an old expectation that the task intentionally replaces. Retain necessary independent scenarios in delivered project tests. Do not discard a failure or call it baseline/environment without actual original-state evidence. Do not restore files over user changes. Report passed final checks, delivered obligations and unverified requirements separately in ordinary prose; no JSON or command-ID selection is required.',
        pass, maximumCorrections: 3, originalTask: initial.task, observations, current,
      };
      // First-pass names remain readable by historical artifact consumers.
      const label = pass === 1 ? 'correction' : `correction-${pass}`;
      io.save(pass === 1 ? 'feedback.json' : `feedback-${pass}.json`, feedback);
      io.checkActive(); report.repairs = pass; report.correctionReasons = observations.reasons; save();
      const previous = evidence(observations);
      report.authorSummary = await author(label, JSON.stringify(feedback));
      current = capture(`D${pass}`); observations = observe(`D${pass}`);
      const diagnosticProgress = newDiagnostics(observations);
      unchanged = evidence(observations) === previous && !diagnosticProgress ? unchanged + 1 : 0;
      if (observations.reasons.length && unchanged >= 2) {
        report.stopReason = 'Two consecutive corrective replies left the same verified problem without substantive new diagnostic evidence.';
        break;
      }
    }
    if (observations.reasons.length && !report.stopReason)
      report.stopReason = 'Three corrective replies exhausted; the final patch still has unfinished verification.';
    io.save('final-observations.json', observations);
    const final = capture('final');
    if (final.snapshotSha256 !== current.snapshotSha256) throw Error('Final snapshot changed after factual observations; checks are stale');
    report.observations = observations;
    report.remaining = [...observations.reasons];
    report.limits = [...observations.limits, ...(report.stopReason ? [report.stopReason] : [])];
    report.status = observations.checksCurrent && !observations.limits.length && !report.remaining.length ? 'checks_passed' : 'incomplete';
    report.coverage = observations.testChanges.length ? 'changed_scenarios_require_assessment' : 'no_existing_test_changes_observed';
    report.notice = 'Observed project checks only. Coverage equivalence, original task completeness and model effectiveness are not certified. Read the patch, test changes and author explanation.';
  } catch (error) {
    report.status = io.aborted() ? 'cancelled' : 'incomplete'; report.limits.push(error.message);
  }
  save(); return report;
}
