// Independent post-execution verification only; never loaded in an author container.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {projectCheck} from '../../native-task-ab/project-check.mjs';
import {script} from '../../native-task-h00-transfer/evaluation-cases.mjs';
const root=path.resolve('local/native-sensitivity/diagnostic-authorized-2'),historical=path.resolve('local/native-task-h00-transfer');
const read=p=>JSON.parse(fs.readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex'),freeze=read(root+'/freeze.json');
if(!fs.existsSync(root+'/outcome.json'))throw Error('Wait for the entire model series to stop before grading');
const ignored=new Set(['.git','node_modules','coverage','.nyc_output','dist','.pnpm-store']);
function files(dir){const out={};function walk(d,p=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(ignored.has(e.name))continue;const n=p+e.name,f=path.join(d,e.name);if(e.isDirectory())walk(f,n+'/');else if(e.isFile()){out[n]=fs.readFileSync(f);out[n].executable=!!(fs.statSync(f).mode&0o111);}else throw Error('Unsupported retained file: '+n);}}walk(dir);return out;}
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024});
const put=(dir,n,b)=>{if(path.isAbsolute(n)||n.split('/').some(x=>x==='..'||x==='.git'))throw Error('Unsafe source name');fs.mkdirSync(path.dirname(dir+'/'+n),{recursive:true});fs.writeFileSync(dir+'/'+n,b);fs.chmodSync(dir+'/'+n,b.executable?0o755:0o644);};
for(const attempt of freeze.attempts){
 const id=attempt.task+'-'+attempt.arm,run=root+'/runs/'+id,out=root+'/checks/'+id;
 if(!fs.existsSync(run+'/completed.json'))continue;
 if(fs.existsSync(out+'/checks.json'))continue;
 fs.mkdirSync(out,{recursive:true});
 const result=read(run+'/result.json'),stop=read(run+'/stop-verification.json');
 const base=run+'/candidate/.git/harness-task',dirs=fs.existsSync(base)?fs.readdirSync(base).filter(n=>fs.existsSync(base+'/'+n+'/worktree')):[];
 if(dirs.length!==1){fs.writeFileSync(out+'/unavailable.json',JSON.stringify({reason:'No unique author worktree',slot:attempt.slot}));continue;}
 const taskDir=base+'/'+dirs[0],delivery=taskDir+'/worktree',baseline=files(attempt.source),candidate=files(delivery),omitted=[];
 // A prepared ignored lock absent from the native worktree is not an author deletion.
 if(baseline['package-lock.json']&&!candidate['package-lock.json']){
  const upstream=historical+'/sources/'+attempt.project;
  if(git(upstream,['ls-files','package-lock.json']).trim()||git(upstream,['check-ignore','package-lock.json']).trim()!=='package-lock.json')throw Error('Unproven preparation-only lock');
  delete baseline['package-lock.json'];omitted.push('package-lock.json (prepared, ignored, absent from public Git source)');
 }
 const copy=out+'/ordinary-git-copy';fs.mkdirSync(copy);
 for(const[n,b]of Object.entries(baseline))put(copy,n,b);
 git(copy,['init','-q']);git(copy,['add','--all','--force']);git(copy,['-c','user.name=Patch verification','-c','user.email=patch@localhost','-c','commit.gpgsign=false','commit','--allow-empty','-qm','Prepared public baseline']);
 const terminal=taskDir+'/terminal.patch';let terminalApplicable=false;
 if(fs.existsSync(terminal)){
  git(copy,['apply','--check',terminal]);git(copy,['apply',terminal]);
  const got=files(copy);
  terminalApplicable=Object.keys(got).length===Object.keys(candidate).length&&Object.entries(candidate).every(([n,b])=>got[n]?.equals(b)&&got[n].executable===b.executable);
  if(!terminalApplicable)throw Error('Terminal patch does not reproduce author bytes/modes: '+id);
 }else{
  for(const n of Object.keys(baseline))if(!candidate[n])fs.rmSync(copy+'/'+n);
  for(const[n,b]of Object.entries(candidate))put(copy,n,b);
 }
 git(copy,['add','--all','--force']);const patch=git(copy,['diff','--cached','--binary','--no-ext-diff','--no-textconv','HEAD']);fs.writeFileSync(out+'/source.patch',patch);
 if(fs.existsSync(terminal))fs.copyFileSync(terminal,out+'/terminal.patch');
 const changed=Object.keys(candidate).filter(n=>!baseline[n]?.equals(candidate[n])||baseline[n]?.executable!==candidate[n].executable),deleted=Object.keys(baseline).filter(n=>!candidate[n]);
 const entry={slot:attempt.slot,case:attempt.task,task:attempt.originalTask,project:attempt.project,arm:attempt.arm,sourcePatchSha256:sha(patch),changed,deleted,omitted,terminalApplicable,nativeCompleted:result.nativeCompleted,stopVerified:stop.terminationVerified,taskArtifacts:taskDir};
 fs.writeFileSync(out+'/delivery.json',JSON.stringify(entry,null,2));
 const source=historical+'/inputs/'+attempt.originalTask,overlay={'.delivery.patch':Buffer.from(patch).toString('base64')};
 const apply='git apply --check .delivery.patch && git apply .delivery.patch && rm .delivery.patch';
 const ordinary=await projectCheck({source,output:out+'/ordinary',toolchain:freeze.toolchain,overlay,command:['sh','-c',apply+' && npm test']});
 const independent=await projectCheck({source,output:out+'/independent',toolchain:freeze.toolchain,overlay:{...overlay,'.independent.cjs':Buffer.from(script(attempt.originalTask,attempt.project)).toString('base64')},command:['sh','-c',apply+' && timeout 10s node .independent.cjs']});
 let sensitivity=null;
 if(ordinary.exit===0){
  const mutation=attempt.project==='denque'?`const fs=require('fs');fs.appendFileSync('index.js',"\\n;(function(){var original=Denque.prototype.removeWhere;Denque.prototype.removeWhere=function(){var count=original.apply(this,arguments);if(count>0)this._capacity=undefined;return count;};}());\\n");`:`const fs=require('fs');let source=fs.readFileSync('index.js','utf8');const anchor='\\n\\t// For tests.';if(source.split(anchor).length!==2)throw Error('Pinned class insertion anchor missing');source=source.replace(anchor,'\\n\\t__diagnosticDropComputedExpiry(key) { const entry=this.#cache.get(key) ?? this.#oldCache.get(key); if(entry)entry.expiry=undefined; }'+anchor);source+='\\n;{const original=QuickLRU.prototype.getOrInsertComputed;QuickLRU.prototype.getOrInsertComputed=function(key,factory){let computed=false;const value=original.call(this,key,(...args)=>{computed=true;return factory(...args);});if(computed)this.__diagnosticDropComputedExpiry(key);return value;};}\\n';fs.writeFileSync('index.js',source);`;
  const command=attempt.project==='denque'?'node_modules/.bin/mocha':'node_modules/.bin/ava';
  sensitivity=await projectCheck({source,output:out+'/required-gap',toolchain:freeze.toolchain,overlay:{...overlay,'.diagnostic.cjs':Buffer.from(mutation).toString('base64')},command:['sh','-c',apply+' && node .diagnostic.cjs && '+command]});
 }
 fs.writeFileSync(out+'/checks.json',JSON.stringify({entry,ordinary,independent,sensitivity,quality:'Requires manual full patch and assertion review; no automatic Q from exits'},null,2));
 console.log(JSON.stringify({id,ordinary:ordinary.exit,independent:independent.exit,requiredGap:sensitivity?.exit??null,terminalApplicable}));
}
