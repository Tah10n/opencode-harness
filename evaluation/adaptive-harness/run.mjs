// Explicit scripted-only experiment. The shared scheduler owns transport, recording,
// native execution and stopping; Harness² owns the adaptive dependency graph.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {manifest} from '../support/manifest.mjs';
import {runComparison} from '../support/scheduler.mjs';
import {startContainer} from '../support/container-session.mjs';
import {runNativePhase} from '../support/native-run.mjs';
import {stopWorkload} from '../support/stop-workload.mjs';
import {captureCandidate} from '../polybench/capture.mjs';
import {privateJSON} from '../support/output-files.mjs';
import {sha,treeHash,validateHarness,readTree,writeTree,Budget,limits} from './policy.mjs';
import {scripted,isAuxiliary} from './scripted.mjs';

export const directory=path.dirname(fileURLToPath(import.meta.url));
const prompts=JSON.parse(fs.readFileSync(path.join(directory,'prompts.json')));
const command=(cmd,args)=>{const r=spawnSync(cmd,args,{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024});if(r.status!==0)throw Error(r.stderr||r.error?.message||cmd+' failed');return r.stdout.trim();};
const save=(file,data)=>privateJSON(file,data);
const read=file=>JSON.parse(fs.readFileSync(file));
const filesHash=root=>treeHash(manifest(root));

// Executes inside the stopped container. No host extraction of model-controlled paths.
const snapshotScript=`const fs=require('fs'),path=require('path');const tree=Object.create(null),errors=[];let size=0;
function walk(d,p=''){for(const n of fs.readdirSync(d).sort()){if(p===''&&n==='.git')continue;const f=path.join(d,n),rel=p+n,s=fs.lstatSync(f);
if(s.isSymbolicLink()||(!s.isFile()&&!s.isDirectory())){errors.push('unsafe type: '+rel);continue;}
if(s.isDirectory()){walk(f,rel+'/');continue;}if(s.nlink!==1||s.mode&73){errors.push('unsafe mode/link: '+rel);continue;}
size+=s.size;if(size>${limits.bytes}||Object.keys(tree).length>=${limits.files})throw Error('snapshot limit');tree[rel]=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(fs.readFileSync(f));}}
walk('/work/repo');console.log(JSON.stringify({tree,errors}));`;

export async function run({output,assets,mode='adaptive-k1',scriptedOnly=false,budgetOptions,fault=null}) {
  // No upstream import, auth lookup, runtime launch or output creation before admission.
  if(!scriptedOnly)throw Error('Real model runs are not authorized or implemented; use --scripted');
  if(!['adaptive-k1','plain-single','plain-multi'].includes(mode))throw Error('Unsupported mode');
  if(![output,assets].every(p=>path.isAbsolute(p)))throw Error('Absolute paths required');
  if(fs.existsSync(output))throw Error('Output exists; no resume or solver retry');
  const budget=new Budget(budgetOptions),source=readTree(path.join(directory,'fixture/source'));
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const inputs=path.join(output,'public-source');writeTree(inputs,source);
  const admin=path.join(output,'admin');fs.mkdirSync(admin);fs.copyFileSync(path.join(directory,'fixture/admin/acceptance.mjs'),path.join(admin,'acceptance.mjs'));fs.writeFileSync(path.join(admin,'sentinel.txt'),'ADAPTIVE_PRIVATE_SENTINEL');
  const policy={mode,k:mode==='adaptive-k1'?1:0,upstream:'1cfe254e8d25b15f37048c3730134686abe60335',adapterHead:command('git',['-C',directory,'rev-parse','HEAD']),
    adapter:manifest(directory),support:manifest(path.resolve(directory,'../support')),capture:sha(fs.readFileSync(path.resolve(directory,'../polybench/capture.mjs'))),
    productLibrary:manifest(path.resolve(directory,'../../lib')),responseFixture:sha(fs.readFileSync(path.resolve(directory,'../feedback-development/installed.mjs'))),
    assets:manifest(assets),image:process.env.EVALUATION_IMAGE,source:treeHash(source),task:sha(source['TASK.md']),prompts,budget:budget.policy,
    graph:mode==='adaptive-k1'?['base','inv1.a1 (one invalid-proposal repair maximum)','dom1.a1 (one invalid-proposal repair maximum)','inv1','dom1','agg1.a1 (one invalid-proposal repair maximum)','agg1','selector']:mode==='plain-multi'?['base','plain1','plain2','plain3','selector']:['base'],
    surface:['systemprompt.md','skills/<name>/SKILL.md'],selection:{pool:mode==='adaptive-k1'?'base + agg1':mode==='plain-multi'?'four plain':'base',rule:'existing id + full-tree SHA256; no repair or fallback'},fault};
  if(!/^sha256:[a-f0-9]{64}$/.test(policy.image??''))throw Error('Immutable EVALUATION_IMAGE required');
  const pinned=read(path.join(directory,'upstream.json'));
  for(const [file,digest] of Object.entries(pinned.files))if(sha(fs.readFileSync(path.join(directory,'vendor',file)))!==digest)throw Error('Upstream pin mismatch: '+file);
  save(path.join(output,'freeze.json'),policy);const freezeHash=sha(fs.readFileSync(path.join(output,'freeze.json')));
  const verify=()=>{budget.check();if(sha(fs.readFileSync(path.join(output,'freeze.json')))!==freezeHash||filesHash(directory)!==treeHash(policy.adapter)||filesHash(path.resolve(directory,'../support'))!==treeHash(policy.support)||filesHash(path.resolve(directory,'../../lib'))!==treeHash(policy.productLibrary)||sha(fs.readFileSync(path.resolve(directory,'../feedback-development/installed.mjs')))!==policy.responseFixture||sha(fs.readFileSync(path.resolve(directory,'../polybench/capture.mjs')))!==policy.capture||filesHash(assets)!==treeHash(policy.assets)||treeHash(readTree(inputs))!==policy.source)budget.close('Frozen input changed');};
  const journal=[],runs={},records=[];let selected=null;
  const log=entry=>{journal.push({sequence:journal.length+1,at:new Date().toISOString(),...entry});save(path.join(output,'journal.json'),journal);};
  const block=error=>{budget.closed??=error.message;save(path.join(output,'admission-closed.json'),{reason:budget.closed});};
  async function stage({role,label,tree={},publicSource,mission,candidates}) {
    verify();validateHarness(tree,{base:role!=='solver'||!Object.values(tree).some(Boolean)});
    if(!/^[a-z0-9.-]+$/.test(label))throw Error('Invalid stage label');
    const root=path.join(output,'stages',label);if(fs.existsSync(root))throw Error('Repeated stage');
    fs.mkdirSync(root,{recursive:true,mode:0o700});
    const input=path.join(root,'input');writeTree(input,publicSource);
    const template=path.join(root,'template');fs.mkdirSync(template);
    for(const n of ['rg','package.json','package-lock.json','node_modules'])fs.cpSync(path.join(assets,'plain',n),path.join(template,n),{recursive:true,verbatimSymlinks:true});
    writeTree(path.join(template,'harness'),tree);
    const hash=treeHash(readTree(path.join(template,'harness'))),templateBefore=filesHash(template);
    const config={model:'openai/gpt-5.6-luna',small_model:'openai/gpt-5.6-luna',instructions:Object.keys(tree).includes('systemprompt.md')&&tree['systemprompt.md']?['/template/harness/systemprompt.md']:[],
      provider:{openai:{options:{baseURL:'http://127.0.0.1:4099/v1',apiKey:'relay-only'},models:{'gpt-5.6-luna':{options:{reasoningEffort:'high'},variants:{high:{reasoningEffort:'high'}}}}}},
      permission:{external_directory:{'*':'deny','/template/harness/*':'allow'},webfetch:'deny',task:'deny'}};
    log({event:'stage-admitted',role,label,inputHash:treeHash(publicSource),harnessHash:hash,configHash:treeHash(config),missionHash:sha(mission)});
    save(path.join(root,'freeze.json'),{experimentKind:'fixture',model:config.model,variant:'high',budgetMs:Math.max(1,budget.deadline-Date.now()),preflightPassed:true,files:{},
      runtimeManifests:{[template]:manifest(template)},toolchain:path.join(assets,'toolchain'),dependencies:template,config,
      streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,inputManifests:{'task-P':manifest(input)},attempts:[{slot:1,task:'task',arm:'P',source:input}]});
    let snapshot,result,nativeSession;const admissionAbort=new AbortController();
    const providerScript=scripted({role,label,source,harness:tree,candidates,fault,budget,
      onDeadlineProbe:()=>log({event:'deadline-probe',role,label})});
    let recordingFault=false;
    const fetchImpl=async(...args)=>{
      let response;try{response=await providerScript(...args);}catch(e){save(path.join(root,'scripted-error.json'),{name:e.name,message:e.message});throw e;}
      if(fault==='recording'&&!recordingFault){recordingFault=true;fs.appendFileSync(path.join(root,'runs/task-P/request-1.json'),'corrupted');}
      return response;
    };
    const capture=(session,out)=>{
      const got=session.exec(['node','-e',snapshotScript]);if(got.status!==0)throw Error('Full tree capture failed: '+got.stderr);snapshot=JSON.parse(got.stdout);save(path.join(out,'snapshot.json'),snapshot);
      return captureCandidate(session,out);
    };capture.requiresOutputRetention=true;
    const oldLog=console.log;console.log=()=>{};
    try {
      result=await runComparison({root,fetchImpl,readAuth:()=>({access:'scripted-only',accountId:'scripted-only'}),stopWorkload,captureCandidate:capture,
        startContainer:async options=>{
          verify();
          if(fault==='tamper'&&label==='inv1')fs.appendFileSync(path.join(template,'harness/systemprompt.md'),'changed after validation');
          if(filesHash(template)!==templateBefore)throw Error('Materialization changed before launch');
          const s=await startContainer({...options,onRequest:async(frame,send,signal)=>{
            try{budget.request(isAuxiliary(frame.body)?'auxiliary':role);}
            catch(e){block(e);log({event:'request-denied',label,role,reason:e.message});admissionAbort.abort(e);send({type:'headers',status:409,contentType:'text/plain'});send({type:'end'});return;}
            try {
              await options.onRequest(frame,send,signal);
            } finally {
              // Active clients must stop even if the recorder detects a fault after
              // forwarding the response and OpenCode would otherwise wait or retry.
              const pause=path.join(root,'scheduling-paused.json');
              if(fs.existsSync(pause)) {
                const error=Error(read(pause).kind);
                admissionAbort.abort(error);
                block(error);
              }
            }
          }});
          nativeSession=s;const r=s.exec(['git','rev-parse','HEAD']);if(r.status!==0){s.close();throw Error('No clean baseline');}s.baseline=r.stdout.trim();s.arm='P';s.armMode='plain';return s;
        },
        runTaskImplementation:async(s,options)=>{verify();return runNativePhase(s,{...options,signal:AbortSignal.any([options.signal,admissionAbort.signal]),enabled:false,task:mission,deadline:budget.deadline,deadlineMono:budget.deadlineMono,limitMs:Math.max(1,budget.remaining())});}});
    } finally {console.log=oldLog;}
    const provider=read(path.join(out,'provider-metadata.json'));records.push(...provider.map(r=>({...r,role,label})));
    save(path.join(output,'requests.json'),records);
    const stop=read(path.join(out,'stop-verification.json'));
    if(result.status!=='finished'||!stop.terminationVerified||!stop.relayRemoved||stop.activeProviderHandlers||stop.providerServerStateMayRemainUnknown||provider.some(r=>r.forwarded&&!r.recording?.evidenceComplete))throw Error(result.pause?.kind??'Unverified execution');
    const finished=read(path.join(out,'session/finished.json'));
    if(finished.exitCode!==0||finished.timedOut||finished.parseErrors)throw Error('Native execution incomplete');
    const evidence=read(path.join(out,'native-evidence.json'));
    const events=fs.readFileSync(path.join(out,'session/events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    if(!events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')||events.some(e=>e.type==='error'))throw Error('Native response incomplete');
    const final=events.filter(e=>e.type==='text').map(e=>e.part?.text??'').join('\n');
    const outputFiles=read(path.join(out,'native-output/manifest.json')).files;
    const trajectory=evidence.tools.map(({data})=>{
      const tool=JSON.stringify(data);
      const reference=data.state?.metadata?.outputPath;
      if(!reference&&!data.state?.metadata?.truncated)return tool;
      const archived=outputFiles.find(file=>file.sourceReference===reference&&file.archiveComplete);
      if(!archived)return tool+'\n[Display truncated by OpenCode. Full output unavailable; this is not a check verdict.]';
      const bytes=fs.readFileSync(path.join(out,archived.destination));
      return tool+'\n[Archived native output; source completeness unknown]\n'+bytes.toString('utf8');
    }).join('\n');
    fs.writeFileSync(path.join(out,'public-trajectory.txt'),trajectory);
    if(filesHash(template)!==templateBefore)throw Error('Materialization changed after validation');
    const patchHash=sha(fs.readFileSync(path.join(out,'model.patch')));
    log({event:'stage-finished',role,label,harnessHash:hash,snapshotHash:treeHash(snapshot.tree),patchHash,container:nativeSession.name,stop,requests:provider.filter(r=>r.forwarded).length});
    // Full request/response archives and captured patches are compact evidence; copies of dependencies are disposable.
    fs.rmSync(template,{recursive:true,force:true});
    budget.check();
    return {directory:out,tree:snapshot.tree,errors:snapshot.errors,hash:treeHash(snapshot.tree),harnessHash:hash,patchHash,final,checks:evidence.tools.filter(t=>t.data.tool==='bash'&&t.data.state?.input?.command==='node --test').map(t=>t.data.state.output??'')};
  }
  async function handle(message) {
    verify();
    if(message.operation==='validate') {try{validateHarness(message.tree);return {valid:true};}catch(e){return {valid:false,reason:e.message};}}
    if(message.operation==='solve') {
      const r=await stage({role:'solver',label:message.label,tree:message.tree,publicSource:source,mission:source['TASK.md']});
      if(r.errors.length)throw Error(r.errors.join('; '));runs[message.label]=r;return {directory:r.directory};
    }
    if(message.operation==='propose') {
      const contextRoot=path.join(output,'context');const context=path.resolve(message.context);
      if(!context.startsWith(contextRoot+path.sep))throw Error('Invalid context location');
      const original=readTree(context),mission=message.mission+'\n\n'+prompts.editorBoundary;
      const publicSource={...Object.fromEntries(Object.entries(original).map(([p,t])=>['context/'+p,t])),'TASK.md':mission};
      const r=await stage({role:message.label.startsWith('agg')?'composer':'editor',label:message.label,publicSource,mission});
      let reason=r.errors.join('; '),tree={};
      for(const [p,t] of Object.entries(r.tree))if(p.startsWith('context/harness/'))tree[p.slice('context/harness/'.length)]=t;
      for(const p of new Set([...Object.keys(r.tree),...Object.keys(publicSource)]))if(!p.startsWith('context/harness/')&&r.tree[p]!==publicSource[p])reason+='; changed forbidden file: '+p;
      try{validateHarness(tree);}catch(e){reason+='; '+e.message;}
      log({event:'proposal',label:message.label,valid:!reason,reason,proposalHash:treeHash(tree)});
      return {valid:!reason,reason,tree,text:r.final};
    }
    if(message.operation==='select') {
      save(path.join(output,'upstream-result.json'),message.method);
      const candidates=Object.entries(message.ids).map(([id,label])=>{
        const artifact=runs[label];
        const patch=fs.readFileSync(path.join(artifact.directory,'model.patch'));
        if(sha(patch)!==artifact.patchHash)throw Error('Captured patch changed before selection');
        return {id,sha256:artifact.hash,patch:patch.toString('utf8'),checks:artifact.checks};
      });
      let choice;
      if(mode==='plain-single')choice={id:candidates[0].id,sha256:candidates[0].sha256};
      else {
        const publicSource={'TASK.md':prompts.selector,'context/task.md':source['TASK.md'],'context/candidates.json':JSON.stringify(candidates,null,2)};
        const r=await stage({role:'selector',label:'selector',publicSource,mission:prompts.selector,candidates});
        if(r.errors.length||treeHash(r.tree)!==treeHash(publicSource))throw Error('selection_failed: selector modified evidence');
        try{choice=JSON.parse(r.final);}catch{throw Error('selection_failed: malformed JSON');}
        if(!choice||typeof choice!=='object'||Object.keys(choice).sort().join(',')!=='id,sha256')throw Error('selection_failed: invalid fields');
      }
      const item=candidates.find(c=>c.id===choice.id&&c.sha256===choice.sha256);if(!item)throw Error('selection_failed: absent artifact or wrong hash');
      const label=message.ids[item.id],artifact=runs[label];
      if(treeHash(read(path.join(artifact.directory,'snapshot.json')).tree)!==item.sha256||
        sha(fs.readFileSync(path.join(artifact.directory,'model.patch')))!==artifact.patchHash)throw Error('Artifact changed after selection');
      selected={...choice,label,patchHash:sha(fs.readFileSync(path.join(artifact.directory,'model.patch'))),artifact:artifact.directory,composition:mode==='adaptive-k1'?{label:'agg1',sha256:runs.agg1.hash,patchHash:sha(fs.readFileSync(path.join(runs.agg1.directory,'model.patch')))}:null,candidateCount:candidates.length};
      save(path.join(output,'selection.json'),selected);log({event:'selection-committed',...selected});return selected;
    }
    throw Error('Unknown bridge operation');
  }
  let child;
  try {
    // Python runs only pure method code. Its environment contains no provider or user settings.
    child=spawn('python3',['-B',path.join(directory,'controller.py'),output,inputs,mode],{cwd:output,env:{PATH:process.env.PATH,HOME:output,PYTHONDONTWRITEBYTECODE:'1',LANG:'C.UTF-8'},stdio:['pipe','pipe','pipe']});
    const errors=[];child.stderr.on('data',b=>errors.push(b));
    const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    for await(const line of readline.createInterface({input:child.stdout})) {
      try{const answer=await handle(JSON.parse(line));child.stdin.write(JSON.stringify(answer)+'\n');}
      catch(e){block(e);child.stdin.write(JSON.stringify({error:e.message})+'\n');}
    }
    const code=await exit;fs.writeFileSync(path.join(output,'controller.stderr'),Buffer.concat(errors));
    if(code!==0||!selected)throw Error('incomplete: '+(budget.closed??Buffer.concat(errors).toString()));
    verify();
    // Independent check has its own read-only mount; full author tree and tests preserved.
    const solution=path.join(output,'delivered-tree');writeTree(solution,runs[selected.label].tree);
    log({event:'independent-check-started',selectionHash:sha(fs.readFileSync(path.join(output,'selection.json')))});
    const session=await startContainer({source:solution,toolchain:path.join(assets,'toolchain'),template:null,output:path.join(output,'judge-session'),evaluationDirectory:admin,onRequest:()=>{throw Error('No model in independent check');}});
    let checked;
    try {budget.check();checked=session.exec(['node','/judge/acceptance.mjs']);save(path.join(output,'independent-check.json'),{status:checked.status,stdout:checked.stdout,stderr:checked.stderr,treeHash:selected.sha256,selectionHash:sha(fs.readFileSync(path.join(output,'selection.json')))});}
    finally {if(session.close()!==0)throw Error('Independent check cleanup unverified');}
    log({event:'independent-check-finished',status:checked.status});
    const report={status:'complete',mode,selected,budget:budget.report(),realModelRequests:0,observedUsage:records.reduce((a,r)=>({input:a.input+(r.usage?.input_tokens??0),output:a.output+(r.usage?.output_tokens??0)}),{input:0,output:0}),independentStatus:checked.status};
    save(path.join(output,'result.json'),report);return report;
  }catch(e){block(e);const report={status:budget.closed?.includes('selection_failed')?'selection_failed':'incomplete',reason:budget.closed,budget:budget.report(),realModelRequests:0};save(path.join(output,'result.json'),report);return report;}
  finally {
    if(child?.exitCode===null)child.kill('SIGKILL');
    const stages=path.join(output,'stages');
    for(const name of fs.existsSync(stages)?fs.readdirSync(stages):[]){const root=path.join(stages,name);if(!fs.existsSync(path.join(root,'runs/task-P/session/retained-resource.json')))fs.rmSync(path.join(root,'template'),{recursive:true,force:true});}
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [output,assets,mode,flag]=process.argv.slice(2);
  const result=await run({output:path.resolve(output??''),assets:path.resolve(assets??''),mode,scriptedOnly:flag==='--scripted'});
  console.log(JSON.stringify(result,null,2));if(result.status!=='complete')process.exitCode=1;
}
