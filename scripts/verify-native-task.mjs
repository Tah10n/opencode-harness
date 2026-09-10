import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareObservations,commandWords} from '../lib/native-task-observations.mjs';
import {runWorkflow,nativePermissionDenial,stateTransition} from '../lib/native-task-workflow.mjs';
import {reviewContext} from '../lib/native-review-context.mjs';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-d-check-'));
const rules=[{permission:'read',pattern:'*',action:'allow'}];
const run=(cwd,args)=>{const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
try {
 const bundle=path.join(temp,'bundle');materializeNativeTemplate({repositoryRoot:path.resolve('.'),outputDirectory:bundle,task:true,review:true});
 const config=JSON.parse(fs.readFileSync(path.join(bundle,'opencode.json')));
 assert.ok(config.command['harness-review']);assert.ok(config.command['harness-task']);assert.equal(config.agent['harness-task-reviewer'],undefined);
 for(const mode of ['correct','fail','stale','revert','unknown','echo','coverage','move','deny','cancel','unavailable']){
  const dir=path.join(temp,mode);fs.mkdirSync(dir);const artifacts=path.join(dir,'.artifacts');
  const original="import {test} from 'node:test';import assert from 'node:assert/strict';test('kept name',()=>{assert.equal(1,1);assert.equal(2,2);});\n";
  fs.writeFileSync(path.join(dir,'legacy.test.mjs'),original);fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({scripts:{test:'node --test'}}));fs.writeFileSync(path.join(dir,'.gitignore'),'.artifacts\n');
  run(dir,['init','-q']);run(dir,['add','.']);run(dir,['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@local','commit','-qm','base']);fs.mkdirSync(artifacts);
  const observe=prepareObservations({directory:dir,artifacts,permissionRules:rules});let state='S',events=[],prompts=[],aborted=false;
  const capture=()=>({...reviewContext({cwd:dir,base:'HEAD',permissionRules:rules}),snapshotSha256:state,task:'Keep independent scenarios; replace only explicitly requested expectation.'});
  const check=()=>{const r=spawnSync(process.execPath,['--test'],{cwd:dir,encoding:'utf8'});events.push({tool:'bash',callID:'call-'+events.length,state:'completed',args:{command:'node --test'},exit:r.status,output:r.stdout+r.stderr,before:state,after:state});};
  const mutate=bytes=>{fs.writeFileSync(path.join(dir,'legacy.test.mjs'),bytes);const before=state;state+='T';events.push({tool:'write',state:'completed',before,after:state});};
  const io={capture,observe:s=>observe(events,s),save:(n,v)=>fs.writeFileSync(path.join(artifacts,n),typeof v==='string'?v:JSON.stringify(v)),aborted:()=>aborted,
   checkActive:()=>{if(aborted)throw Error('cancelled');if(events.some(e=>e.permissionDenied))throw Error('permission denied');},messages:async()=>[],
   prompt:async(role,prompt)=>{assert.equal(role,'author');prompts.push(prompt);
    if(prompts.length===1){
     if(mode==='fail')mutate(original.replace('1,1','1,2'));
     if(mode==='coverage')mutate(original.replace('assert.equal(2,2);',''));
     if(mode==='move'){fs.renameSync(path.join(dir,'legacy.test.mjs'),path.join(dir,'new.test.mjs'));events.push({tool:'bash',before:state,after:'T'});state='T';}
     if(mode==='deny')events.push({permissionDenied:true});
     if(mode==='cancel')aborted=true;
     if(mode==='echo')events.push({tool:'bash',args:{command:'echo ok'},state:'completed',exit:0,before:state,after:state});
     else if(mode!=='unavailable')check();
     if(mode==='stale')mutate(original+'// edit\n');
     if(mode==='revert'){mutate(original+'// edit\n');mutate(original);state='S';}
     if(mode==='unknown')events.push({tool:'read',state:'error',before:null,after:state});
    }else {
     const feedback=JSON.parse(prompt);assert.ok(feedback.observations.reasons.length);assert.ok(feedback.originalTask);
     if(mode==='fail'){assert.equal(feedback.observations.latestChecks[0].exit,1);mutate(original);check();}
     if(mode==='coverage'){assert.ok(feedback.observations.testChanges[0].before.includes('2,2'));assert.ok(feedback.observations.checksCurrent);mutate(original);check();}
     if(mode==='move'){assert.equal(feedback.observations.testChanges[0].after,null);assert.equal(feedback.observations.addedTests[0].content,original);}
     if(['stale','revert','unknown'].includes(mode))check();
    }
    return {info:{finish:'stop',id:'message-'+prompts.length},parts:[{type:'text',text:'Ordinary prose; no JSON IDs'}]};
   }};
  const result=await runWorkflow(io);assert.ok(prompts.length<=2);
  assert.equal(result.repairs,['correct','deny','cancel'].includes(mode)?0:1,mode);
  assert.equal(result.status,mode==='cancel'?'cancelled':['echo','unavailable','deny'].includes(mode)?'incomplete':'checks_passed',JSON.stringify(result));
 }
 // Independent review counterexamples: a new smoke is not the required route,
 // Node root names and pure additions still receive scenario assessment.
 for(const filename of ['test.js','test-legacy.js','legacy.test.mjs']) {
  const dir=path.join(temp,'counter-'+filename);fs.mkdirSync(dir);const artifacts=path.join(dir,'.artifacts');fs.mkdirSync(artifacts);
  const original="import {test} from 'node:test';import assert from 'node:assert/strict';\ntest('two independent scenarios',()=>{\nassert.equal(1,1);\nassert.equal(2,2);\n});\n";
  fs.writeFileSync(path.join(dir,filename),original);fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({type:'module',scripts:{test:'node --test '+filename}}));fs.writeFileSync(path.join(dir,'.gitignore'),'.artifacts\n');
  run(dir,['init','-q']);run(dir,['add','.']);
  const observe=prepareObservations({directory:dir,artifacts,permissionRules:rules});
  fs.writeFileSync(path.join(dir,'scratch.test.mjs'),"import {test} from 'node:test';test('smoke',()=>{});");
  const executed=command=>{const r=spawnSync(process.execPath,command.split(' ').slice(1),{cwd:dir,encoding:'utf8'});return{tool:'bash',state:'completed',args:{command},exit:r.status,output:r.stdout+r.stderr,before:'S',after:'S'};};
  assert.equal(observe([executed('node --test scratch.test.mjs')],{snapshotSha256:'S'}).checksCurrent,false);
  fs.writeFileSync(path.join(dir,filename),original.replace('assert.equal(2,2);','return;\nassert.equal(2,2);'));
  const facts=observe([executed('node --test '+filename)],{snapshotSha256:'S'});
  assert.equal(facts.checksCurrent,true);assert.ok(facts.testChanges.length);assert.equal(facts.testChanges[0].removedOrChangedLines,false);assert.ok(facts.reasons.some(r=>r.includes('test/fixture')));
 }
 {let captured=0;const report=await runWorkflow({checkActive:()=>{},save:()=>{},aborted:()=>false,messages:async()=>[],prompt:async()=>({info:{finish:'stop'},parts:[]}),capture:()=>({status:'captured',snapshotSha256:++captured<3?'checked':'changed',diff:'',task:'task'}),observe:()=>({reasons:[],limits:[],testChanges:[],checksCurrent:true})});assert.equal(report.status,'incomplete');assert.ok(report.limits.some(l=>l.includes('Final snapshot changed')));}
 assert.equal(nativePermissionDenial('The user rejected permission to use this specific tool call.'),true);
 assert.equal(nativePermissionDenial('File not found: The user rejected permission to use this specific tool call.'),false);
 assert.equal(stateTransition({state:'error',before:null,after:'S',stateObservation:{basis:'host-rejected-before-execution',snapshot:'S'}}),'unchanged');
 for(const cmd of ['echo hi','node --test; echo ok','node --test $(whoami)','node --test `pwd`'])if(cmd!=='echo hi')assert.equal(commandWords(cmd),null);
 console.log(JSON.stringify({passed:true,realTemporaryFiles:true,nativeStateAndPermissions:true,oneCorrectionBound:true,realProviderRequests:0}));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
