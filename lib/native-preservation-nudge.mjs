// Optional advisory only. Never executes project code or changes check authority.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {commandWords} from './native-task-observations.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const safeName = x => typeof x === 'string' && /^[\w./ () ,:-]{1,180}$/.test(x);
const testPath = p => /(?:^|\/)(?:tests?|specs?|__tests__|fixtures)(?:\/|$)|[._-](?:test|spec)\.[^/]+$/.test(p);
const production = p => !testPath(p) && /\.(?:[cm]?js|tsx?|jsx)$/.test(p) && !/(?:^|\/)[^/]*(?:config|\.d\.ts)/.test(p);
function diffParts(diff) {
  const result = new Map();
  for (const block of diff.split(/(?=^diff --git )/m).filter(Boolean)) {
    const m = /^diff --git a\/(\S+) b\/(\S+)\n/.exec(block);
    if (!m || m[1] !== m[2]) throw Error('unsupported_diff_path');
    result.set(m[1], block);
  }
  return result;
}
function productionState(snapshot) {
  return hash(JSON.stringify([...diffParts(snapshot.diff)].filter(([p]) => production(p))));
}
function completed(event) {
  return event.tool === 'bash' && event.executionAdmitted === true && event.state === 'completed' && event.exit === 0 &&
    !event.cancelled && !event.cancellation && !event.signal && !event.timeout && !event.permissionDenied && !event.scopeViolation && event.callID &&
    event.before === event.after && Number.isFinite(event.startedAt) && Number.isFinite(event.completedAt) && event.completedAt >= event.startedAt &&
    JSON.stringify(event.admittedArgs) === JSON.stringify(event.args);
}
// Two literal nvm prefixes and one recognized invocation, using the shared tokenizer.
const relativeFile = p => typeof p === 'string' && p.length <= 180 && /^[\w./-]+$/.test(p) && !path.isAbsolute(p) && !p.split('/').includes('..');
const filterText = p => typeof p === 'string' && p.length > 0 && p.length <= 120 && !/[\x00-\x1f\x7f]/.test(p);
export function advisoryCommand(command) {
  if (typeof command !== 'string' || command.length > 4096) return null;
  const nvm = /^(?:\.|source) \/usr\/local\/nvm\/nvm\.sh && nvm use (\d+\.\d+\.\d+) && /.exec(command);
  const words = commandWords(nvm ? command.slice(nvm[0].length) : command);
  if (!words) return null;
  if (words[0] === 'npm' && words[1] === 'test' && words[2] === '--' && words[3] === '--grep' && words.length === 5 && filterText(words[4]))
    return {runner:'mocha', route:'npm', filter:words[4], nvm:nvm?.[1]};
  if (words[0] === 'node' && words[1] === '--test' && words.length === 3 && relativeFile(words[2]) && /\.(?:[cm]?js)$/.test(words[2]))
    return {runner:'node', file:words[2], nvm:nvm?.[1]};
  if (words[0] !== './node_modules/.bin/mocha' || words[1] !== '--opts' || !relativeFile(words[2])) return null;
  const files=[]; let filter;
  for (let i=3;i<words.length;i++) {
    if (words[i] === '--grep' && filter === undefined && filterText(words[i+1])) filter=words[++i];
    else if (!words[i].startsWith('-') && relativeFile(words[i]) && /\.(?:[cm]?js)$/.test(words[i])) files.push(words[i]);
    else return null;
  }
  if (files.length > 32) return null;
  return files.length || filter ? {runner:'mocha', route:'direct', opts:words[2], files, filter, nvm:nvm?.[1]} : null;
}
export function mochaReport(output) {
  // Full spec reporter section only. A total by itself is never test evidence.
  const lines = output.trimEnd().split('\n');
  const total = /^  ([1-9]\d*) passing \(\d+(?:ms|s)\)$/.exec(lines.at(-1));
  if (!total) return null;
  let suite = null; const cases = [];
  for (const line of lines.slice(0,-1)) {
    if (!line.trim()) continue;
    const heading = /^  (\S.*)$/.exec(line);
    const test = /^    [✓✔] (.+?)(?: \(\d+ms\))?$/.exec(line);
    if (test && suite && safeName(test[1])) cases.push({suite, name:test[1]});
    else if (heading && !line.startsWith('   ') && !/^\d+ (?:passing|failing|pending)\b/.test(heading[1]) && safeName(heading[1])) suite = heading[1];
    else return null;
  }
  if (cases.length !== Number(total[1]) || new Set(cases.map(c => JSON.stringify(c))).size !== cases.length) return null;
  return cases;
}
function nodeReport(output) {
  // Full single-case TAP or spec grammar. No source assertion/name inference.
  const lines = output.trim().split('\n');
  if (lines.length===9 && /^✔ (.+) \([\d.]+ms\)$/.test(lines[0]) &&
      lines.slice(1,8).join('\n')==='ℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0' && /^ℹ duration_ms [\d.]+$/.test(lines[8])) {
    const name=/^✔ (.+) \([\d.]+ms\)$/.exec(lines[0])[1];
    return safeName(name)?name:null;
  }
  const report=/^TAP version 13\n# Subtest: ([^\n]+)\nok 1 - \1\n  ---\n  duration_ms: [\d.]+\n(?:  type: 'test'\n)?  \.\.\.\n1\.\.1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms [\d.]+\n?$/.exec(output);
  return report && safeName(report[1]) ? report[1] : null;
}
export function createPreservationNudge({directory, inputs, initial, save, active, remainingMs}) {
  const {packages, packageBytes, npmConfigs} = inputs;
  const read = name => {state.additionalReads++; return inputs.read(name);};
  const state = {version:2, additionalReads:0, eligibleEvents:0, status:'idle', baselineSnapshot:initial.snapshotSha256, considered:0, reasons:{}, attachedBlocks:0, addedBytes:0, classificationMs:0};
  let initialProduction;
  try { initialProduction = productionState(initial); } catch { initialProduction = null; }
  const config = new Map();
  // Capture bounded baseline configuration only. No test-body or coverage discovery.
  for (const [base,pkg] of packages) {
    const words = commandWords(pkg.scripts?.test);
    if (words?.length === 3 && words[0] === 'mocha' && words[1] === '--opts') {
      const name = path.posix.join(base,words[2]);
      try {
        if (name.startsWith('../') || path.isAbsolute(name) || !/^[\w./-]+$/.test(name)) throw Error('unsupported configuration path');
        config.set(name,read(name));
        for (const part of (pkg.scripts.build ?? '').split(' && ')) {
          const argv=commandWords(part);
          const file=argv?.[0]==='node'?argv[1]:argv?.[0]==='rollup'&&argv[1]==='-c'?(argv[2]??'rollup.config.js'):null;
          if (file) {
            if (file.startsWith('../') || path.isAbsolute(file) || !/^[\w./-]+$/.test(file)) throw Error('unsupported configuration path');
            config.set(path.posix.join(base,file),read(path.posix.join(base,file)));
          }
        }
      } catch { config.set(name,undefined); }
    }
  }
  const persist = () => save('preservation-nudge.json',state);
  const skip = reason => {state.status = state.attachedBlocks ? 'attached_to_receipt' : 'skipped/unknown'; state.reason=reason;state.reasons[reason]=(state.reasons[reason]??0)+1;return null;};
  const resolve = name => {
    const relative = path.relative(directory,path.resolve(directory,name));
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative) || !/^[\w./-]+$/.test(relative)) throw Error('unsupported_path');
    return relative;
  };
  function classify(event) {
    const command=advisoryCommand(event.args.command);
    if (!command || !completed(event) || typeof event.output!=='string' || Buffer.byteLength(event.output)>128*1024) return null;
    const cwd=path.relative(directory,path.resolve(directory,event.args.workdir??'.')) || '.';
    if (cwd !== '.') return null; // Nested package routes deliberately not supported yet.
    const pkg=packages.get('.');
    if (!pkg || read('package.json') !== packageBytes.get('.') || npmConfigs.get('.') === undefined || read('.npmrc') !== npmConfigs.get('.')) return null;
    let output=event.output;
    if (command.nvm) {
      const banner=new RegExp('^Now using node v'+command.nvm.replaceAll('.', '\\.')+' \\(npm v[0-9.]+\\)\\n');
      if (!banner.test(output)) return null;
      output=output.replace(banner,'');
    }
    if (command.runner === 'node') {
      if (pkg.scripts?.test !== 'node --test' || pkg.scripts.pretest || pkg.scripts.posttest) return null;
      const name=nodeReport(output);
      return name ? [{suite:command.file,name}] : null;
    }
    for (const [name,bytes] of config) if (typeof bytes!=='string' || read(name)!==bytes) return null;
    const script=commandWords(pkg.scripts?.test);
    if (script?.length !== 3 || script[0] !== 'mocha' || script[1] !== '--opts' || pkg.scripts.posttest) return null;
    const opts=resolve(script[2]);
    if (!config.has(opts) || typeof config.get(opts) !== 'string') return null;
    // The opts entry may load further suites. Only the report describes execution.
    if (command.route === 'direct') {
      if (resolve(command.opts) !== opts) return null;
    } else {
      if (pkg.scripts.pretest !== 'npm run build' || !/^node [\w/.-]+ && rollup -c(?: [\w/.-]+)?(?: && rollup -c(?: [\w/.-]+)?)*$/.test(pkg.scripts.build??'')) return null;
      const marker='> '+pkg.name+'@'+pkg.version+' test\n> '+pkg.scripts.test+' --grep '+command.filter+'\n';
      if (output.split(marker).length !== 2 || !output.includes('> '+pkg.scripts.build+'\n') || !/^created [\w/.-]+ in [\d.]+(?:ms|s)$/m.test(output)) return null;
      output=output.split(marker)[1];
    }
    return mochaReport(output);
  }

  return {
    after(event,snapshot,events) {
      if(event.tool!=='bash') return null;
      const start=performance.now(); state.considered++;
      try {
        if(state.attachedBlocks) return skip('already_attached');
        if(!active() || remainingMs()<120000) return skip('inactive_or_budget');
        if(!completed(event) || snapshot.snapshotSha256!==event.after) return skip('unconfirmed_or_changed_execution');
        if(initialProduction===null) return skip('initial_diff_unknown');
        if(productionState(snapshot)===initialProduction) return skip('no_production_change');
        const cases=classify(event);
        if(!cases?.length) return skip('unsupported_command_configuration_or_report');
        // Require the existing complete serialized event chain. No negative
        // inference from an excerpt, missing admission or a discontinuity.
        let expected=initial.snapshotSha256;
        for(const e of events) { if(e.before!==expected || !e.after) return skip('incomplete_history'); expected=e.after; }
        if(expected!==snapshot.snapshotSha256 || events.at(-1)!==event) return skip('incomplete_history');
        const scope=cases.map(c=>c.suite+': '+c.name).join('; ').split(/\s+/).slice(0,20).join(' ').slice(0,180);
        state.eligibleEvents++;
        state.candidate={callID:event.callID,baselineSnapshot:initial.snapshotSha256,snapshot:event.after,scope,observedCount:cases.length,selection:advisoryCommand(event.args.command)};
        state.status='eligible';persist();
        if(!active() || remainingMs()<120000) return skip('inactive_before_attachment');
        return '\n\nPreservation advisory: After production changes, a selected test run passed: '+JSON.stringify(scope)+'. This result alone does not establish preservation of other behavior. Before further expectation or snapshot updates, consider whether an appropriate existing behavioral scenario for the affected path has run on the current build. If not, choose and run one; if already checked, no repeat is needed. Prefer a check taking at most 120 seconds including preparation. This advice does not certify build freshness or replace task requirements and final checks. Further edits may require repeating tests.\n';
      } catch {return skip('advisory_read_or_parse_error');}
      finally {state.classificationMs+=performance.now()-start;persist();}
    },
    attached(callID,text) {
      if(state.status!=='eligible'||state.candidate?.callID!==callID||state.attachedBlocks) throw Error('Invalid advisory attachment');
      state.status='attached_to_receipt';state.attachedBlocks=1;state.addedBytes=Buffer.byteLength(text);persist();
    },
    state,
  };
}
