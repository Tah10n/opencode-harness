import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {runWorkflow} from '../../lib/native-task-workflow.mjs';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';
import {original,changed,gated,mixed,oldAssertion,newAssertion,acceptanceSource} from './fixture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function promptsFor(workflow, strategy, stop=null) {
  const prompts=[];let active=true;
  const result=await workflow({
    capture:()=>({status:'captured',snapshotSha256:'fixed',diff:'',task:'PUBLIC_TASK'}),
    save:()=>{},messages:async()=>[],aborted:()=>stop==='cancel'&&!active,
    checkActive:()=>{if(!active)throw Error(stop);},
    terminalReason:()=>!active&&stop==='denial'?{kind:'permission_denied',message:'denied'}:null,
    observe:()=>({reasons:[],limits:[],testChanges:[],checksCurrent:true}),
    prompt:async(role,text)=>{assert.equal(role,'author');prompts.push(text);if(stop)active=false;return {info:{finish:'stop'},parts:[]};},
  },{strategy});
  return {prompts,result};
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'direct-assertion-'));
try {
  const direct=await promptsFor(runWorkflow,'direct'), d=await promptsFor(runWorkflow,'D'), cf=await promptsFor(runWorkflow,'check-first');
  assert.equal(direct.prompts.length,1);assert.equal(d.prompts.length,1);assert.equal(cf.prompts.length,2);
  const block=direct.prompts[0].slice(direct.prompts[0].indexOf('During self-review,'),direct.prompts[0].indexOf('\nOriginal task:'));
  assert.ok(block.split(/\s+/).length<=220);
  assert.equal(direct.prompts[0].replace('\n'+block,''),d.prompts[0]);
  // Frozen pre-change prompt bytes: no accidental text changes to D/check-first.
  const expected=JSON.parse(fs.readFileSync(new URL('./prior-prompts.json',import.meta.url)));
  assert.deepEqual([d,cf].map(v=>v.prompts.map(hash)),expected);
  for(const phrase of ['Preserved contract: fix implementation','Explicitly replaced behavior','Wrong setup','Ambiguous requirements','same supported public caller','without adding metadata or flags','Do not delete mixed tests','Respect test-write permissions'])assert.ok(block.includes(phrase));
  for(const stop of ['cancel','denial','deadline']) {
    const {prompts,result}=await promptsFor(runWorkflow,'direct',stop);
    assert.equal(prompts.length,1);assert.equal(result.stages.length,1);assert.equal(result.repairs,0);
    assert.equal(result.status,stop==='cancel'?'cancelled':'incomplete');
    if(stop==='denial')assert.equal(result.terminalReason.kind,'permission_denied');
  }
  for(const mode of ['ordinary','review','task']) {
    const bundle=path.join(temp,mode);materializeNativeTemplate({repositoryRoot:root,outputDirectory:bundle,review:mode==='review',task:mode==='task'});
    if(mode==='task') {
      assert.deepEqual(fs.readFileSync(bundle+'/native-task-workflow.mjs'),fs.readFileSync(root+'/lib/native-task-workflow.mjs'));
      const installed=await import(pathToFileURL(bundle+'/native-task-workflow.mjs'));
      assert.deepEqual((await promptsFor(installed.runWorkflow,'direct')).prompts,direct.prompts);
    }else for(const f of fs.readdirSync(bundle))assert.ok(!fs.readFileSync(bundle+'/'+f,'utf8').includes(block));
  }
  const controls=[];
  for(const [name,source,replaced,want] of [
    ['replacement',changed,true,0],['preserved-production-repaired',original,false,0],
    ['unjustified-optional-gate',gated,true,1],['false-obsolete-claim',changed,false,1],
    ['mixed-negative-validation-lost',changed.replace("  if (typeof value !== 'string') throw new TypeError('text required');", "  if (typeof value !== 'string') return '';"),true,1],
  ]) {
    fs.writeFileSync(temp+'/index.cjs',source);
    const r=spawnSync(process.execPath,['-e',acceptanceSource(replaced)],{cwd:temp,encoding:'utf8'});
    assert.equal(r.status,want,r.stdout+r.stderr);
    controls.push({name,acceptanceExit:r.status});
  }
  assert.equal(mixed.replace(oldAssertion,newAssertion).replace(newAssertion,oldAssertion),mixed);
  console.log(JSON.stringify({passed:true,prompt:{words:block.split(/\s+/).length,bytes:Buffer.byteLength(block),sha256:hash(block)},stages:{direct:1,D:1,checkFirst:2},nonTargetBytesUnchanged:true,controls,realProviderCalls:0}));
}finally{fs.rmSync(temp,{recursive:true,force:true});}
