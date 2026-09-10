// Read-only host observations. No candidate command is executed by this module.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {stateTransition} from './native-task-workflow.mjs';
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
export function prepareObservations({directory,artifacts,permissionRules,task = ''}) {
  const git = args => {
    const r=spawnSync('git',['--no-pager','--no-optional-locks','-c','core.fsmonitor=false',...args],{cwd:directory,encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024});
    if(r.status!==0)throw Error('Observation Git enumeration failed');return r.stdout;
  };
  const listed = () => git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
  const originals=new Map(), packages=new Map(), initialLimits=[];
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
  return (events,snapshot) => {
    const boundary=events.findLastIndex(e=>stateTransition(e)!=='unchanged');
    const checks=[];
    for(const [index,event] of events.entries()) {
      if(event.tool!=='bash')continue;
      let argv=commandWords(event.args?.command);if(!argv?.length)continue;
      if(argv.join(' ')==='git diff --check'&&task.includes('git diff --check')) {
        checks.push({eventIndex:index,callID:event.callID,command:event.args.command,workdir:event.args.workdir??'.',provenance:'explicit original task',key:'git diff --check',purpose:'whitespace',exit:event.exit??null,state:event.state,output:event.output??'',before:event.before,after:event.after,current:index>boundary&&event.before===snapshot.snapshotSha256&&event.after===snapshot.snapshotSha256,successful:event.state==='completed'&&event.exit===0});continue;
      }
      const cwd=path.resolve(directory,event.args?.workdir??'.'),relative=path.relative(directory,cwd);
      if(relative==='..'||relative.startsWith('../')||path.isAbsolute(relative))continue;
      const pkg=packages.get(relative||'.');
      let provenance='initial Node test workflow',canonical=argv;
      if(argv[0]==='npm'&&(argv.length===2&&argv[1]==='test'||argv.length===3&&argv[1]==='run'&&argv[2]==='test')) {
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
      if(canonical.slice(2).some(x=>x.startsWith('-')&&!/^--test-(?:concurrency=\d+|timeout=\d+|reporter=(?:tap|spec)|name-pattern=.+)$/.test(x)))continue;
      const output=event.output??'',counts=[...output.matchAll(/^(?:# |ℹ )tests (\d+)\s*$/gm)];
      const tests=counts.length?Number(counts.at(-1)[1]):null;
      checks.push({eventIndex:index,callID:event.callID,command:event.args.command,workdir:relative||'.',provenance,
        key:JSON.stringify([relative,canonical]),exit:event.exit??null,state:event.state,output,
        before:event.before,after:event.after,current:index>boundary&&event.before===snapshot.snapshotSha256&&event.after===snapshot.snapshotSha256,
        tests,successful:event.state==='completed'&&event.exit===0&&tests>0});
    }
    const latest=[...new Map(checks.map(c=>[c.key,c])).values()];
    const limits=[...initialLimits],reasons=[],testChanges=[];
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
    for(const c of latest) {
      if(!c.current)reasons.push('Missing final verification after the last mutation: '+c.command);
      else if(!c.successful)reasons.push('Relevant project check failed or is incomplete: '+c.command);
    }
    if(testChanges.length)reasons.push('Existing test/fixture content changed or was removed; assess necessary scenario preservation using the exact diff and added tests.');
    if(initialLimits.length)reasons.push('Some original test/configuration observations are unavailable.');
    if(latest.some(c=>!c.current||!c.successful))limits.push('Some observed project checks failed, lacked test results or were not repeated after the last mutation.');
    return {snapshotSha256:snapshot.snapshotSha256,checks,latestChecks:latest,testChanges,addedTests,reasons,limits,checksCurrent:latest.some(c=>c.purpose!=='whitespace')&&latest.every(c=>c.current&&c.successful)&&(!task.includes('git diff --check')||latest.some(c=>c.purpose==='whitespace')),
      checkScope:'Observed Node project tests from initial package scripts; arbitrary shell commands and unsupported runners remain unverified. No model command IDs or executable report strings are consumed.',
      suggestedProjectChecks:[...packages].filter(([,p])=>/^node --test(?: |$)/.test(p.scripts?.test??'')).map(([cwd,p])=>({workdir:cwd,command:p.scripts.test,source:'initial package.json'}))};
  };
}
