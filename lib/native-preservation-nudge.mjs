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
    !event.signal && !event.timeout && !event.permissionDenied && !event.scopeViolation && event.callID &&
    event.before === event.after && Number.isFinite(event.startedAt) && Number.isFinite(event.completedAt) && event.completedAt >= event.startedAt &&
    JSON.stringify(event.admittedArgs) === JSON.stringify(event.args);
}
// Only an optional literal nvm prefix, followed by one npm test invocation.
// No pipelines, trailing commands, substitutions, env overrides or masked exit.
export function advisoryCommand(command) {
  if (typeof command !== 'string') return null;
  const prefix = /^\. \/usr\/local\/nvm\/nvm\.sh && nvm use (\d+\.\d+\.\d+) && /;
  const nvm = prefix.exec(command);
  const words = commandWords(nvm ? command.slice(nvm[0].length) : command);
  if (!words) return null;
  if (words[0] === 'npm' && words[1] === 'test' && words[2] === '--' && words[3] === '--grep' && words.length === 5 &&
      /^[\w ^$()-]{1,120}$/.test(words[4])) return {runner:'mocha', filter:words[4], nvm:nvm?.[1]};
  if (!nvm && words[0] === 'node' && words[1] === '--test' && words.length === 3 && /^[\w./-]+\.(?:[cm]?js)$/.test(words[2]))
    return {runner:'node', file:words[2]};
  return null;
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
    else if (heading && !line.startsWith('   ') && safeName(heading[1])) suite = heading[1];
    else return null;
  }
  if (cases.length !== Number(total[1]) || new Set(cases.map(c => JSON.stringify(c))).size !== cases.length) return null;
  return cases;
}
function nodeReport(output) {
  // TAP, single top-level literal case. Multiple/parameterized cases stay unknown.
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
  const {read, initialFiles, originals, packages, packageBytes, npmConfigs} = inputs;
  const state = {version:1, status:'idle', baselineSnapshot:initial.snapshotSha256, considered:0, reasons:{}, attachedBlocks:0, addedBytes:0, classificationMs:0};
  let initialProduction;
  try { initialProduction = productionState(initial); } catch { initialProduction = null; }
  const config = new Map();
  // Bounded initial configuration only; original test bytes are already retained.
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
  const same = name => originals.has(name) && read(name) === originals.get(name);
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
    if (command.runner === 'node') {
      if (pkg.scripts?.test !== 'node --test' || pkg.scripts.pretest || pkg.scripts.posttest) return null;
      const file=resolve(command.file), content=read(file), name=nodeReport(event.output??'');
      if (!testPath(file) || !name || !content || !/\btest\s*=\s*require\(['"]node:test['"]\)|import\s+test\s+from\s+['"]node:test['"]/.test(content)) return null;
      const declarations=[...content.matchAll(/\btest\(\s*(['"])([^'"\n]+)\1\s*,/g)];
      if (declarations.length !== 1 || declarations[0][2] !== name || /\b(?:describe|suite)\s*\(|\btest\s*\./.test(content)) return null;
      const imports=[...content.matchAll(/(?:require\(\s*|from\s+)(['"])(\.\.?\/[^'"\n]+)\1/g)].map(m=>resolve(path.posix.join(path.posix.dirname(file),m[2])));
      const known=new Set([...initialFiles,...diffParts(currentSnapshot.diff).keys()]);
      const targets=imports.flatMap(p=>[p,p+'.js',p+'.mjs',p+'.cjs',p+'/index.js'].filter(n=>known.has(n)&&production(n)));
      if (targets.length!==1) return null;
      const origin=!initialFiles.has(file)?'new':originals.get(file)===content?'old':'unknown';
      return [{scope:JSON.stringify(['node',cwd,targets[0]]), suite:path.posix.dirname(file),name,file,origin}];
    }
    for (const [name,bytes] of config) if (typeof bytes!=='string' || read(name)!==bytes) return null;
    const script=commandWords(pkg.scripts?.test);
    if (script?.length !== 3 || script[0] !== 'mocha' || script[1] !== '--opts' || pkg.scripts.posttest) return null;
    const opts=resolve(script[2]);
    if (!config.has(opts) || typeof config.get(opts) !== 'string' || read(opts)!==config.get(opts)) return null;
    const entry=resolve(config.get(opts).trim());
    if (!same(entry)) return null;
    // Supported loader: literal glob */index.js with a literal cwd, then require.
    const loader=originals.get(entry);
    const load=/glob\.sync\(["']\*\/index\.js["'],\s*\{\s*cwd:\s*["']([\w/-]+)["']\s*\}\)/.exec(loader);
    if (!load || !/require\(["']\.\/["']\s*\+\s*file\)/.test(loader)) return null;
    if (pkg.scripts.pretest !== 'npm run build' || !/^node [\w/.-]+ && rollup -c(?: [\w/.-]+)?(?: && rollup -c(?: [\w/.-]+)?)*$/.test(pkg.scripts.build??'')) return null;
    const output=event.output??'';
    if (command.nvm && !output.startsWith('Now using node v'+command.nvm+' (npm v')) return null;
    const marker='> '+pkg.name+'@'+pkg.version+' test\n> '+pkg.scripts.test+' --grep '+command.filter+'\n';
    if (output.split(marker).length !== 2 || !output.includes('> '+pkg.scripts.build+'\n') || !/^created [\w/.-]+ in [\d.]+(?:ms|s)$/m.test(output)) return null;
    const cases=mochaReport(output.split(marker)[1]); if (!cases) return null;
    // Literal grep only: evaluate no project-supplied regular expressions.
    const filter=command.filter;
    if (!/^[\w -]+$/.test(filter) || cases.some(c=>!(c.suite+' '+c.name).includes(filter))) return null;
    const runners=[...originals].filter(([p])=>p.startsWith(load[1]+'/') && p.split('/').length===load[1].split('/').length+2 && p.endsWith('/index.js'));
    if (runners.length>32) return null;
    const allNames=new Set([...initialFiles,...diffParts(currentSnapshot.diff).keys()]);
    return cases.map(c=>{
      const matches=[];
      for (const [file,source] of runners) {
        const suites=[...source.matchAll(/\bdescribe\(\s*(["'])([^"'\n]+)\1\s*,/g)];
        if (suites.length!==1 || suites[0][2]!==c.suite || !same(file)) continue;
        // Bind a literal readdir root AND a dynamic it name to the runner.
        // Only a bare dir or a template beginning with dir is supported.
        if (!/\bit\)\((?:dir,|`\$\{dir\})/.test(source)) continue;
        for(const m of source.matchAll(/fs\.readdirSync\(\s*(["'])([\w/-]+)\1\s*\)/g)) {
          const root=m[2];
          const names=new Set([...allNames].filter(p=>p.startsWith(root+'/')).map(p=>p.slice(root.length+1).split('/')[0]));
          for(const name of names) if(c.name===name || c.name.startsWith(name+' (')) {
            const files=[...allNames].filter(p=>p.startsWith(root+'/'+name+'/'));
            if (!files.length) continue;
            // Existing changed samples remain unknown, never all-new by file edit.
            const origin=files.every(p=>!initialFiles.has(p))?'new':files.every(p=>originals.has(p)&&same(p))?'old':'unknown';
            matches.push({...c,file,origin,sample:root+'/'+name,scope:JSON.stringify(['mocha',cwd,opts,entry,file,c.suite])});
          }
        }
      }
      return matches.length===1?matches[0]:{...c,origin:'unknown'};
    });
  }
  let currentSnapshot=initial;
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
        currentSnapshot=snapshot;
        const cases=classify(event);
        if(!cases?.length || cases.some(c=>c.origin!=='new')) return skip('scope_or_origin_unknown');
        // Require the existing complete serialized event chain. No negative
        // inference from an excerpt, missing admission or a discontinuity.
        let expected=initial.snapshotSha256;
        for(const e of events) { if(e.before!==expected || !e.after) return skip('incomplete_history'); expected=e.after; }
        if(expected!==snapshot.snapshotSha256 || events.at(-1)!==event) return skip('incomplete_history');
        const scopes=new Set(cases.map(c=>c.scope)), observedScopes=new Set();
        for(const prior of events.slice(0,-1)) {
          if(prior.before!==event.before || prior.after!==event.before || !completed(prior)) continue;
          const old=classify(prior);
          for (const c of old ?? []) if (c.origin==='old'&&scopes.has(c.scope)) observedScopes.add(c.scope);
        }
        if ([...scopes].every(scope=>observedScopes.has(scope))) return skip('current_existing_scope_observed');
        const scope=[...new Set(cases.filter(c=>!observedScopes.has(c.scope)).map(c=>c.suite+': '+c.name))].join('; ').slice(0,400);
        state.candidate={callID:event.callID,baselineSnapshot:initial.snapshotSha256,snapshot:event.after,scope};
        state.status='eligible';persist();
        if(!active() || remainingMs()<120000) return skip('inactive_before_attachment');
        return '\n\nPreservation advisory: A focused new-feature check completed: '+JSON.stringify(scope)+'. After production changes, retained results do not confirm an existing-behavior check in this execution scope. Before further snapshot updates, choose and run one existing public behavioral check on the current implementation, with its normal build preparation. Prefer a check that fits within 120 seconds including preparation, and name its actual coverage. This advice does not replace task requirements or final checks; feature checks may need repeating after another production edit.\n';
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
