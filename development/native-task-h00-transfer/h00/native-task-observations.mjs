// Read-only host observations. No candidate command is executed by this module.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {stateTransition,unexecutedNativeDenial} from './native-task-workflow.mjs';
const testPath = p => /(?:^|\/)(?:test|tests|spec|specs|__tests__|fixtures|__fixtures__)(?:\/|$)|(?:^|\/)(?:test|test-[^/]+)\.(?:js|cjs|mjs)$|[._-](?:test|spec)\.[^/]+$/.test(p);
const match = (v,p) => new RegExp('^'+p.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\?/g,'.')+'$','s').test(v);
function readable(directory, name, rules) {
  for (const spelling of [name,path.join(directory,name)]) {
    let action='ask';
    for(const rule of rules) if(['*','read'].includes(rule.permission)&&match(spelling,rule.pattern)) action=rule.action;
    if(action!=='allow') return false;
  }
  let cursor=directory;
  for(const part of name.split('/')) {
    cursor=path.join(cursor,part);
    try { if(fs.lstatSync(cursor).isSymbolicLink()) return false; }
    catch(e) { if(e.code==='ENOENT') return true; throw e; }
  }
  return true;
}
// A conservative tokenizer for observations, never a shell interpreter.
export function commandWords(command) {
  if(typeof command!=='string'||/[$`\n\r]/.test(command)) return null;
  const words=[];let word='',quote=null,active=false;
  for(const c of command.trim()) {
    if(quote) { if(c===quote) quote=null; else word+=c; active=true; }
    else if(c==='"'||c==="'") { quote=c;active=true; }
    else if(/\s/.test(c)) { if(active) words.push(word);word='';active=false; }
    else if(/[;&|<>\\(){}]/.test(c)) return null;
    else {word+=c;active=true;}
  }
  if(quote)return null;if(active)words.push(word);return words;
}
const commandProgram = words => words?.slice(words.findIndex(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)));
export function prepareObservations({directory,artifacts,permissionRules,task = ''}) {
  const git = args => {
    const r=spawnSync('git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args],{cwd:directory,encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024});
    if(r.status!==0)throw Error('Observation Git enumeration failed');return r.stdout;
  };
  const listed = () => git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
  const originals=new Map(), packages=new Map(), initialLimits=[];
  const instructions = [{source:'original task',text:task}];
  const initialFiles=new Set(listed());
  const read = name => {
    if(!readable(directory,name,permissionRules)) throw Error('Observation path is not an allowed regular file: '+name);
    try {const stat=fs.statSync(path.join(directory,name));if(!stat.isFile()||stat.size>2*1024*1024)throw Error('Observation file exceeds supported scope: '+name);return fs.readFileSync(path.join(directory,name),'utf8');}
    catch(e){if(e.code==='ENOENT')return null;throw e;}
  };
  const originalDir=path.join(artifacts,'original-tests');fs.mkdirSync(originalDir,{mode:0o700});
  for(const name of initialFiles) {
    if(!testPath(name)&&path.basename(name)!=='package.json')continue;
    try {
      const bytes=read(name);if(bytes===null)continue;
      if(testPath(name)) {originals.set(name,bytes);const file=path.join(originalDir,name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,bytes,{mode:0o600});}
      if(path.basename(name)==='package.json') {try{packages.set(path.posix.dirname(name),JSON.parse(bytes));}catch{initialLimits.push('Invalid initial package configuration: '+name);}}
    }catch(e){initialLimits.push(e.message);}
  }
  for (const name of initialFiles) {
    if (!['AGENTS.md','WORKFLOW.md'].includes(path.basename(name))) continue;
    try { instructions.push({source:name,text:read(name) ?? ''}); }
    catch (e) { initialLimits.push(e.message); }
  }
  // Reuse the existing conservative command tokenizer. Only literal supported
  // commands are bound here; prose relevance and other runners stay unresolved.
  const literalCommands = instructions.flatMap(({source,text}) =>
    [...text.matchAll(/`([^`\n]+)`|^(node --test[^\n]*|npm (?:test|run test)|git diff --check)$/gm)]
      .flatMap(m => {
        const command = m[1] ?? m[2], words = commandProgram(commandWords(command));
        return words?.[0] === 'node' && words[1] === '--test' || ['npm test','npm run test','git diff --check'].includes(command)
          ? [{command,source,workdir:source==='original task'?'.':path.posix.dirname(source)}] : [];
      }));
  if (task.includes('git diff --check') && !literalCommands.some(c => c.command === 'git diff --check' && c.workdir === '.'))
    literalCommands.push({command:'git diff --check',source:'original task',workdir:'.'});
  const explicitSource = (command, workdir) => literalCommands.find(c => c.command === command && c.workdir === workdir)?.source;
  return (events,snapshot) => {
    const boundary=events.findLastIndex(e=>stateTransition(e)!=='unchanged');
    const checks=[];
    for(const [index,event] of events.entries()) {
      if(event.tool!=='bash'||unexecutedNativeDenial(event))continue;
      let argv=commandWords(event.args?.command);if(!argv?.length)continue;
      const cwd=path.resolve(directory,event.args?.workdir??'.'),relative=path.relative(directory,cwd);
      if(relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))continue;
      if(argv.join(' ')==='git diff --check' && explicitSource(event.args.command,relative||'.')) {
        checks.push({eventIndex:index,callID:event.callID,command:event.args.command,workdir:relative||'.',provenance:'explicit original instruction',key:JSON.stringify([relative,'git diff --check']),purpose:'whitespace',exit:event.exit??null,state:event.state,output:event.output??'',before:event.before,after:event.after,current:index>boundary&&event.before===snapshot.snapshotSha256&&event.after===snapshot.snapshotSha256,successful:event.state==='completed'&&event.exit===0});continue;
      }
      const pkg=packages.get(relative||'.');
      const program=commandProgram(argv);
      // Environment-prefixed invocations remain unsupported evidence: in
      // particular NODE_OPTIONS must not smuggle a preload into this route.
      // Their literal obligation is retained, never closed by a plain command.
      if (program.length !== argv.length) continue;
      let provenance='initial Node test workflow',canonical=program;
      if(program[0]==='npm'&&(program.length===2&&program[1]==='test'||program.length===3&&program[1]==='run'&&program[2]==='test')) {
        const script=pkg?.scripts?.test;
        // A mutated script cannot inherit the initial script's authority.
        let current;try{current=JSON.parse(read(path.posix.join(relative,'package.json')));}catch{continue;}
        if(!script||current.scripts?.test!==script||current.scripts?.pretest||current.scripts?.posttest)continue;
        canonical=commandWords(script);provenance='initial package.json scripts.test';
      }
      if(canonical?.[0]!=='node'||canonical[1]!=='--test')continue;
      // Node tests must be an established initial project route. No inline JS,
      // preload, eval, imports, arbitrary executables or custom reporters.
      const normalize=args=>args?.filter(x=>!/^--test-(?:concurrency|timeout|reporter)=/.test(x));
      const declared=normalize(commandWords(pkg?.scripts?.test));
      const invocation=normalize(canonical);
      const files=canonical.slice(2).filter(x=>!x.startsWith('-'));
      const exact=declared&&JSON.stringify(declared)===JSON.stringify(invocation);
      // A targeted run is a permitted projection only of an initial automatic
      // discovery route and actual initial test files, never a new smoke file.
      const targeted=files.length>0&&files.every(file=>{
        const absolute=path.resolve(cwd,file),name=path.relative(directory,absolute);
        if(!initialFiles.has(name)||!testPath(name))return false;
        return [...packages].some(([base,p])=>{
          const route=normalize(commandWords(p.scripts?.test));
          return route?.join(' ')==='node --test'&&(base==='.'||name.startsWith(base+'/'));
        });
      });
      if(!exact&&!targeted)continue;
      if(exact)provenance='initial package.json scripts.test';
      if(canonical.slice(2).some(x=>x.startsWith('-')&&!/^--test-(?:concurrency=\d+|timeout=\d+|reporter=(?:tap|spec)|name-pattern=.+)$/.test(x)))continue;
      const output=event.output??'',counts=[...output.matchAll(/^(?:# |ℹ )tests (\d+)\s*$/gm)];
      const tests=counts.length?Number(counts.at(-1)[1]):null;
      checks.push({eventIndex:index,callID:event.callID,command:event.args.command,workdir:relative||'.',provenance,
        key:JSON.stringify([relative,argv]),exit:event.exit??null,state:event.state,output,
        before:event.before,after:event.after,current:index>boundary&&event.before===snapshot.snapshotSha256&&event.after===snapshot.snapshotSha256,
        tests,successful:event.state==='completed'&&event.exit===0&&tests>0});
    }
    // Execution history is evidence, not authority. Keep exact command keys:
    // concurrency, filters, environment and file selection are not interchangeable.
    for (const c of checks) {
      const source = explicitSource(c.command,c.workdir);
      c.requirement = source ? 'required' : 'diagnostic';
      c.requirementSource = source ?? 'Additional observed Node check; execution alone creates no repeat obligation';
    }
    const latest=[...new Map(checks.map(c=>[c.key,c])).values()];
    const limits=[...initialLimits],reasons=[],testChanges=[];
    const unclassifiedFailures = events.flatMap((event,eventIndex) => event.tool === 'bash' && !unexecutedNativeDenial(event) &&
      event.exit !== 0 && !checks.some(c => c.eventIndex === eventIndex)
      ? [{eventIndex,command:event.args?.command,state:event.state,exit:event.exit ?? null,output:event.output ?? '',
        before:event.before,after:event.after,requirement:'unresolved'}] : []);
    if (unclassifiedFailures.length) limits.push('Uninterpreted command failures are retained; their relevance and any baseline/environment exception remain unverified.');
    const currentFiles=listed();
    for(const [name,before] of originals) {
      let after;try{after=read(name);}catch(e){limits.push(e.message);continue;}
      if(before===after)continue;
      // Diff the actual captured initial bytes, including uncommitted user work.
      const beforeFile=path.join(originalDir,name), scratch=path.join(artifacts,'test-diff-current');
      fs.writeFileSync(scratch,after??'',{mode:0o600});
      const result=spawnSync('git',['diff','--no-index','--no-ext-diff','--no-textconv','--',beforeFile,scratch],{encoding:'utf8',maxBuffer:8*1024*1024,timeout:15000});
      if(![0,1].includes(result.status))throw Error('Cannot capture exact test diff');
      const diff=result.stdout;
      const hunks=diff.slice(diff.indexOf('@@')).split('\n');
      const fragment=side=>hunks.filter(line=>line.startsWith(' ')||line.startsWith(side)||line.startsWith('@@')).map(line=>line.startsWith('@@')?line:line.slice(1)).join('\n');
      testChanges.push({path:name,before:fragment('-'),after:after===null?null:fragment('+'),diff,originalRetained:true,removedOrChangedLines:/^-(?!--)/m.test(diff),assessment:'not_automatically_classified'});
    }
    // New tests are useful context for equivalent moves; never infer equivalence.
    const addedTests=[];
    for(const name of currentFiles.filter(n=>testPath(n)&&!originals.has(n))) {
      try {addedTests.push({path:name,content:read(name)});}catch(e){limits.push(e.message);}
    }
    if(!latest.some(c=>c.purpose!=='whitespace')){reasons.push('No observed relevant project test/check.');limits.push('Executable project verification unavailable or not observed. Echo, Git status, prose and exit 0 alone are not quality checks.');}
    if(task.includes('git diff --check')&&!latest.some(c=>c.purpose==='whitespace')) {reasons.push('Missing explicitly required git diff --check.');limits.push('Required whitespace check not observed.');}
    for (const literal of literalCommands) {
      if (!checks.some(c => c.command === literal.command && c.workdir === literal.workdir)) {
        reasons.push('Explicit project/task check not observed: '+literal.command);
        limits.push('Literal check from '+literal.source+' unavailable or not observed: '+literal.command);
      }
    }
    const requiredExecutions=literalCommands.map(literal => checks.findLast(c => c.command === literal.command && c.workdir === literal.workdir)).filter(Boolean);
    for(const c of requiredExecutions) {
      if(!c.current)reasons.push('Missing final verification after the last mutation: '+c.command);
      else if(!c.successful)reasons.push('Project check failed or is incomplete: '+c.command);
    }
    // A later different command is not proof that an earlier failure was fixed.
    // A passing re-execution of the same exact route can resolve that failure;
    // its success does not create a perpetual requirement to rerun the route.
    const unresolvedFailures = checks.filter(c => !c.successful &&
      !checks.some(later => later.key === c.key && later.eventIndex > c.eventIndex && later.successful));
    const additionalFailures=[...new Map(unresolvedFailures.filter(c => c.requirement === 'diagnostic').map(c => [c.key,c])).values()];
    for (const c of additionalFailures) {
      limits.push('Additional check failure has unresolved task relevance; no baseline/environment exception established: '+c.command);
      if (c.tests > 0) reasons.push('Unresolved additional project check failure: '+c.command);
    }
    if (!latest.some(c => c.purpose !== 'whitespace' && c.current && c.successful) &&
        latest.some(c => c.purpose !== 'whitespace')) reasons.push('No successful project test/check on the current state.');
    if(initialLimits.length)limits.push('Some original test/configuration observations are unavailable.');
    if(requiredExecutions.some(c=>!c.current||!c.successful))limits.push('Required project checks failed, lacked test results or were not repeated after the last mutation.');
    return {snapshotSha256:snapshot.snapshotSha256,checks,latestChecks:latest,unclassifiedFailures,unresolvedFailures,testChanges,addedTests,reasons,limits,checksCurrent:latest.some(c=>c.purpose!=='whitespace'&&c.current&&c.successful)&&requiredExecutions.every(c=>c.current&&c.successful)&&!reasons.length,
      requiredChecks:literalCommands.map(c => ({...c,observed:checks.some(e => e.command === c.command && e.workdir === c.workdir)})),
      coverageWarnings:testChanges.length?['Assess changed test scenarios against the original task; changed bytes alone do not require another author turn.']:[],
      deliveryLimitations:['Check results do not establish delivery of every original obligation or semantic equivalence of stateful scenarios; inspect the delivered patch and author explanation.'],
      checkScope:'Observed Node project tests from initial package scripts; arbitrary shell commands and unsupported runners remain unverified. No model command IDs or executable report strings are consumed.',
      suggestedProjectChecks:[...packages].filter(([,p])=>/^node --test(?: |$)/.test(p.scripts?.test??'')).map(([cwd,p])=>({workdir:cwd,command:p.scripts.test,source:'initial package.json'}))};
  };
}
