import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {privateJSON} from '../support/output-files.mjs';
import {manifest} from '../support/manifest.mjs';
import {tasks,command,applyPatch,auditFlags,config,cleanEnvironment,directory} from './suite.mjs';
import {evaluatePatch,scoreOutput,deliveryFacts} from './evaluate.mjs';

export function controlPatch(task,patch,mutate) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-control-'));
  try {
    const repo=path.join(root,'repo');applyPatch(task.source,patch,repo);mutate(repo);
    command('git',['add','-A'],repo);
    return Buffer.from(command('git',['diff','--cached','--binary','--full-index','HEAD'],repo));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
}

export async function preflight(output,{contained=false,toolchain}={}) {
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  assert.equal(tasks.length,8);
  const categories=new Map();for(const task of tasks)categories.set(task.category,(categories.get(task.category)??0)+1);
  assert.deepEqual([...categories.values()],[2,2,2,2]);
  assert.deepEqual(cleanEnvironment({PATH:'safe',HARNESS_TASK_CHECKS:'1',HARNESS_UNKNOWN:'1',OPENCODE_CONFIG_CONTENT:'bad'}),{PATH:'safe'});
  const harnessKeys=auditFlags(),inputHashes=manifest(path.join(directory,'tasks')),rows=[];
  for(const task of tasks) {
    const row={task:task.id,category:task.category,results:{}};
    const variants=['baseline','gold','wrong'];
    if(task.id==='01-invoice-discount')variants.push('discount-field-loss');
    if(task.id==='03-wallet-cancel')variants.push('all-holds-refund');
    for(const variant of variants) {
      const additional=variant==='discount-field-loss'||variant==='all-holds-refund';
      const patch=additional?controlPatch(task,fs.readFileSync(path.join(task.directory,'gold.patch')),repo=>{
        const file=path.join(repo,variant==='discount-field-loss'?'src/pricing.mjs':'src/wallet.mjs'),source=fs.readFileSync(file,'utf8');
        const from=variant==='discount-field-loss'?'  return {items,totalCents:':'state.available+=state.holds[id];';
        const to=variant==='discount-field-loss'?'  for (const item of items) delete item.discountPercent;\n'+from:'state.available += Object.values(state.holds)\n   .reduce((sum, cents) => sum + cents, 0);';
        assert.equal(source.split(from).length,2);fs.writeFileSync(file,source.replace(from,to));
      }):variant==='baseline'?Buffer.alloc(0):fs.readFileSync(path.join(task.directory,variant+'.patch'));
      if(additional)assert.deepEqual(patch,fs.readFileSync(path.join(task.directory,variant+'.patch')),'The retained full negative patch must match controlPatch');
      const result=await evaluatePatch({task,patch,output:path.join(output,task.id,variant),contained,toolchain});
      row.results[variant]=result;
      assert.equal(result.cleanupVerified,true);
      if(variant==='gold')assert.equal(result.R,true,JSON.stringify({task:task.id,variant,result}));
      else assert.equal(result.R,false,JSON.stringify({task:task.id,variant,result}));
      if(additional) {
        assert.equal(result.status,'FAIL');assert.equal(result.patchApplied,true);
        const failed=variant==='discount-field-loss'?'fd01.discount-roundtrip':'fd03.cancel-one-hold-accounting';
        assert.equal(result.obligations.find(r=>r.id===failed)?.status,'FAIL');
      }
      if(variant==='baseline') {
        assert.ok(task.feature.some(id=>result.obligations.find(r=>r.id===id)?.status==='FAIL'));
        assert.ok(task.preservation.every(id=>result.obligations.find(r=>r.id===id)?.status==='PASS'));
      }
      const temp=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-public-'));
      try {
        const source=path.join(temp,'source');applyPatch(task.source,patch,source);
        // Run the ordinary public command too; its result never defines R.
        const {spawnSync}=await import('node:child_process');
        const publicRun=spawnSync('npm',['test'],{cwd:source,env:cleanEnvironment(),encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
        assert.ok(!publicRun.error&&!publicRun.signal);
        result.publicExit=publicRun.status;
        privateJSON(path.join(output,task.id,variant,'public-process.json'),{status:publicRun.status,stdout:publicRun.stdout,stderr:publicRun.stderr});
        if(variant==='gold')assert.equal(publicRun.status,0,publicRun.stdout+publicRun.stderr);
        if(additional)assert.equal(publicRun.status,variant==='discount-field-loss'?1:0);
        if(task.id==='08-options-refactor'&&variant==='baseline')assert.equal(publicRun.status,0);
      }finally{fs.rmSync(temp,{recursive:true,force:true});}
    }
    rows.push(row);console.log('PASS controls '+task.id);
  }
  const task=tasks[0],gold=fs.readFileSync(path.join(task.directory,'gold.patch')),wrong=fs.readFileSync(path.join(task.directory,'wrong.patch'));
  const controls=[];
  const check=async(name,patch,expected)=>{
    const result=await evaluatePatch({task,patch,output:path.join(output,'scorer-controls',name),contained,toolchain});
    assert.equal(result.R,expected,JSON.stringify({name,result}));controls.push({name,...result});return result;
  };
  await check('empty-patch',Buffer.alloc(0),false);
  await check('actual-zero-obligations',controlPatch(task,gold,repo=>fs.writeFileSync(path.join(repo,'src/validate.mjs'),"process.exit(0);\n")),null);
  await check('delete-public-tests',controlPatch(task,Buffer.alloc(0),repo=>fs.rmSync(path.join(repo,'test'),{recursive:true})),false);
  await check('npm-test-noop',controlPatch(task,Buffer.alloc(0),repo=>{
    const file=path.join(repo,'package.json'),p=JSON.parse(fs.readFileSync(file));p.scripts.test='node -e "process.exit(0)"';fs.writeFileSync(file,JSON.stringify(p));
  }),false);
  const extra=repo=>{
    fs.writeFileSync(path.join(repo,'test/000-extra.test.mjs'),"import {test} from 'node:test';test('Unrelated new public test',()=>{});\n");
    const file=path.join(repo,'test/public.test.mjs'),source=fs.readFileSync(file,'utf8');
    const a=source.indexOf("test('discount travels"),b=source.indexOf("test('legacy invoice");assert.ok(a>0&&b>a);
    fs.writeFileSync(file,source.slice(0,a)+source.slice(b)+source.slice(a,b));
  };
  const added=await check('gold-extra-test',controlPatch(task,gold,extra),true);
  assert.deepEqual(added.obligations,rows[0].results.gold.obligations);
  const incorrectAdded=await check('wrong-extra-test',controlPatch(task,wrong,extra),false);
  assert.deepEqual(incorrectAdded.obligations,rows[0].results.wrong.obligations);
  await check('actual-timeout',controlPatch(task,gold,repo=>fs.writeFileSync(path.join(repo,'src/validate.mjs'),"await new Promise(()=>setInterval(()=>{},1000));\n")),null);
  const ids=[...task.feature,...task.preservation];
  const outputOf=rows=>rows.map(row=>JSON.stringify(row)+'\n').join('');
  const valid=[...ids.map(id=>({type:'obligation',id,status:'PASS'})),{type:'complete',counts:{tests:ids.length,passed:ids.length,failed:0,cancelled:0,skipped:0,todo:0}}];
  for(const [name,stdout,extra] of [
    ['zero-obligations',outputOf([{type:'complete',counts:{tests:0}}]),{}],
    ['partial-output',outputOf(valid.slice(0,-1)),{}],
    ['missing-obligation',outputOf(valid.slice(1)),{}],
    ['launch-error','',{error:'ENOENT',status:null}],
    ['timeout',outputOf(valid),{signal:'SIGKILL',status:null}],
    ['duplicate-id',outputOf([valid[0],...valid]),{}],
  ]) {const result=scoreOutput(task,{stdout,status:0,...extra});assert.notEqual(result.R,true);controls.push({name,...result});}
  const reversed=scoreOutput(task,{stdout:outputOf([...valid.slice(0,-1).reverse(),valid.at(-1)]),status:0});assert.equal(reversed.R,true);
  const facts={runtime:{nativeCompleted:true,continuationApplied:false,delivery:'/public/worktree'},capture:{roundtripVerified:true,hasArtifacts:true,delivery:'/public/worktree'},stop:{terminationVerified:true,captureSaved:true,relayRemoved:true,forwardingClosed:true,activeProviderHandlers:0},requests:[{forwarded:true,terminalResponse:{status:'completed'},clientDelivery:'stream-forwarded'}],workflow:{status:'incomplete',repairs:0,stages:[{role:'author',messageID:'completed-author'}],termination:{verified:true,abortRequests:0,pendingTools:0,queuedTools:0,activeTools:0,abortErrors:[]}},nativeEvidence:{messages:[{id:'completed-author',data:{role:'assistant',finish:'stop',time:{created:1,completed:2},path:{cwd:'/public/worktree'}}}]},patchApplied:true};
  assert.equal(deliveryFacts(facts).delivery,true,'Internal incomplete cannot override independently established delivery');
  for(const changed of [{requests:[{forwarded:true,clientDelivery:'unconfirmed-after-transport-error'}]},{stop:{...facts.stop,terminationVerified:false}},{patchApplied:false},{runtime:{...facts.runtime,nativeCompleted:false}},{capture:{...facts.capture,delivery:'/different/worktree'}},{nativeEvidence:{messages:[]}},{workflow:{...facts.workflow,termination:{...facts.workflow.termination,abortRequests:1}}},{nativeEvidence:{messages:[{id:'completed-author',data:{...facts.nativeEvidence.messages[0].data,finish:'cancelled'}}]}}])assert.equal(deliveryFacts({...facts,...changed}).delivery,false);
  const result={suite:config.suite,passed:true,contained,modelFree:true,realProviderCalls:0,harnessKeys,inputHashes,tasks:rows,scorerControls:controls,reorderedStableIds:true,internalStatusSeparated:true};
  privateJSON(path.join(output,'preflight.json'),result);return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const output=process.argv[2]?path.resolve(process.argv[2]):fs.mkdtempSync(path.join(os.tmpdir(),'feedback-preflight-'));
  const at=process.argv.indexOf('--toolchain');
  try{await preflight(output,{contained:process.argv.includes('--contained'),toolchain:at<0?undefined:path.resolve(process.argv[at+1])});console.log('PASS feedback-development model-free preflight');}
  finally{if(!process.argv[2])fs.rmSync(output,{recursive:true,force:true});}
}
