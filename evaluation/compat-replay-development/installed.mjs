import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {prepare,runPrepared} from './campaign.mjs';
import {report} from './report.mjs';
import {tasks,schedule} from './suite.mjs';
import {quoteShell} from '../../lib/native-project-scope.mjs';
import {response} from '../feedback-development/installed.mjs';
import {manifest} from '../support/manifest.mjs';
import {hashFile,privateJSON} from '../support/output-files.mjs';
const textOf=b=>{const m=b.input?.findLast(i=>i.role==='user');return typeof m?.content==='string'?m.content:(m?.content??[]).map(x=>x.text??'').join('\n');};
const title=b=>(b.input??[]).some(i=>['developer','system'].includes(i.role)&&(typeof i.content==='string'?i.content:JSON.stringify(i.content)).startsWith('You are a title generator.'));
const bash=command=>({name:'bash',args:{command,description:'Contained scripted public check'}});
const apply=bytes=>`printf %s ${Buffer.from(bytes).toString('base64')} | base64 -d | git apply`;
export async function installed({output,bundle,toolchain,executionImage,fullSchedule=false}) {
  const task=tasks[0],attempts=fullSchedule?schedule:['control','candidate'].map((arm,i)=>({slot:i+1,task:task.id,arm}));
  prepare({output,bundle,toolchain,executionImage,fixture:true,attempts,campaign:fullSchedule?'compat-replay-development-v2':undefined});
  const wrong=fs.readFileSync(path.join(task.directory,'wrong.patch'));
  const isolation="node -e 'const fs=require(\"fs\"),assert=require(\"assert/strict\");assert.equal(fs.existsSync(\"/judge\"),false);assert.equal(fs.existsSync(\"/input/gold.patch\"),false);assert.throws(()=>fs.writeFileSync(\"/input/compat.json\",\"{}\"),e=>e.code===\"EROFS\");console.log(\"PUBLIC_ONLY_READONLY\")'";
  const author=[bash(isolation),bash(apply(wrong)),bash('npm test')];
  const repair="const fs=require('fs');const p='src/append.mjs';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('out.find(r=>r.value===value)','out.at(-1)'));";
  const corrections=[bash('node -e '+quoteShell(repair)),bash('npm test')];
  let slot=0,arm=attempts[0].arm,requests=0,error,probeDelivered=false;const counters=new Map(),frames=[];
  const scriptedFetch=async(url,options)=>{
    try {
      requests++;const body=JSON.parse(options.body),text=textOf(body),all=JSON.stringify(body);
      assert.equal(body.model,'gpt-5.6-luna');assert.equal(body.reasoning?.effort,'high');assert.doesNotMatch(all,/fd2[1-6]\.(feature|preservation)|acceptance\.test/);
      if(title(body))return response(requests,null,'Compatibility fixture');
      const stage=text.includes('Corrective pass')?'correction':text.includes('Implement the complete original task')?'author':'bootstrap';
      frames.push({slot:slot+1,task:attempts[slot]?.task,arm,stage,model:body.model,effort:body.reasoning.effort});
      const key=slot+arm+stage,n=counters.get(key)??0;counters.set(key,n+1);
      if(stage==='bootstrap'){const reply=response(requests,n===0?{name:'harness_task',args:{}}:null,'Fixture complete');if(n===1){slot++;arm=attempts[slot]?.arm;}return reply;}
      const current=tasks.find(t=>t.id===attempts[slot].task);
      const authorSteps=fullSchedule?[bash(isolation),bash(apply(fs.readFileSync(path.join(current.directory,'wrong.patch')))),bash('npm test')]:author;
      if(stage==='author')return response(requests,authorSteps[n],'Public suite passes; implementation complete.');
      assert.equal(arm,'candidate');assert.match(text,/Preserved behavior differs/);assert.match(text,/src\/index.mjs#/);assert.match(text,/snapshotSha256/);probeDelivered=true;
      const repairs=[repair,
        "const fs=require('fs'),p='src/reverse.mjs';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('row.reverse()','[...row].reverse()'));",
        "const fs=require('fs'),p='src/field.mjs';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(\"if(!Object.hasOwn(row,key))return null;\",'requireField(row,key);'));",
        "const fs=require('fs'),p='src/clip.mjs';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(\"text.split('')\",'Array.from(text)'));",
        "const fs=require('fs'),p='src/parts.mjs';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('parts.filter(Boolean)','parts'));",
        "const fs=require('fs'),p='src/point.mjs';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('options.scale||1','options.scale??1'));"];
      const correctiveSteps=fullSchedule?[bash('node -e '+quoteShell(repairs[tasks.indexOf(current)])),bash('npm test')]:corrections;
      return response(requests,correctiveSteps[n],'Preserved consecutive run behavior restored.');
    }catch(e){error=e;throw e;}
  };
  let authAccesses=0;
  const outcome=await runPrepared(output,{scriptedFetch,readAuth:()=>{authAccesses++;throw Error('Fixture credential callback forbidden');}});assert.equal(authAccesses,0);if(error)throw error;assert.equal(outcome.status,'finished',JSON.stringify(outcome));
  const scored=await report(output),control=scored.rows.find(r=>r.arm==='control'),candidate=scored.rows.find(r=>r.arm==='candidate');
  assert.equal(control.R,false);assert.equal(control.delivery,true);assert.equal(control.corrections,0);
  assert.equal(candidate.R,true);assert.equal(candidate.delivery,true);assert.equal(candidate.corrections,1);assert.equal(candidate.initialR,false);assert.ok(candidate.newDifferencesDelivered>0);
  if(fullSchedule){assert.equal(scored.rows.length,12);for(const r of scored.rows){assert.equal(r.delivery,true);assert.equal(r.initialR,false);assert.equal(r.R,r.arm==='candidate');assert.equal(r.corrections,r.arm==='candidate'?1:0);if(r.arm==='candidate'){assert.ok(r.newDifferencesDelivered>0);assert.equal(r.probeObservations.at(-1).status,'matched');}}}
  const probeCleared=candidate.probeObservations.at(-1).status==='matched';assert.ok(probeDelivered&&probeCleared);
  let calls=0;await assert.rejects(()=>runPrepared(output,{scriptedFetch:()=>{calls++;throw Error('No retry');},readAuth:()=>{calls++;throw Error('No retry');}}),/Previously created slot/);assert.equal(calls,0);
  const receipt={passed:true,realProviderCalls:0,executionImage,binarySha256:hashFile(path.join(toolchain,'package/bin/opencode')).sha256,bundleManifest:manifest(bundle),authAccesses,rows:scored.rows,probeDelivered,probeCleared,frames,syntheticRequests:requests};privateJSON(path.join(output,fullSchedule?'rehearsal.json':'installed.json'),receipt);return receipt;
}
export async function deadlineControls({output,bundle,toolchain,executionImage}) {
  fs.mkdirSync(output);const controls=[];
  for(const arm of ['control','candidate']) {
    const root=path.join(output,arm),task=tasks[0];prepare({output:root,bundle,toolchain,executionImage,fixture:true,attempts:[{slot:1,task:task.id,arm}],budgetMs:5000});
    let n=0,hangIssued=false;
    const scriptedFetch=async(url,options)=>{const body=JSON.parse(options.body);n++;if(title(body))return response(n,null,'Deadline fixture');const t=textOf(body);if(!t.includes('Implement the complete original task'))return response(n,{name:'harness_task',args:{}});hangIssued=true;return response(n,bash("node -e 'setInterval(()=>{},1000)'"));};
    const outcome=await runPrepared(root,{scriptedFetch,readAuth:()=>({access:'scripted',accountId:'scripted'})});
    const stop=JSON.parse(fs.readFileSync(path.join(root,'runs',task.id+'-'+arm,'stop-verification.json')));
    assert.ok(hangIssued);assert.equal(stop.terminationVerified,true);assert.equal(stop.relayRemoved,true);assert.equal(stop.activeProviderHandlers,0);assert.equal(stop.ownTaskDeadlineTriggered,true);controls.push({arm,hangIssued,outcome,stop});
  }
  const receipt={passed:true,realProviderCalls:0,executionImage,binarySha256:hashFile(path.join(toolchain,'package/bin/opencode')).sha256,bundleManifest:manifest(bundle),controls,fixtureBudgetMs:5000,developmentBudgetMs:600000};privateJSON(path.join(output,'deadline.json'),receipt);return receipt;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const [output,bundle,toolchain,mode]=process.argv.slice(2);const options={output,bundle,toolchain,executionImage:process.env.EVALUATION_IMAGE};await installed({...options,fullSchedule:mode==='--all'});if(mode!=='--all')await deadlineControls({...options,output:output+'-deadline'});}
