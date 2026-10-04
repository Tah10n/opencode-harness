import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {hashFile,privateJSON} from '../support/output-files.mjs';
import {manifest} from '../support/manifest.mjs';
import {tasks,schedule,config,directory,repository,prepareSource,frozenManifest,realBatch,command} from './suite.mjs';
import {validateBundle} from './assets.mjs';

export function providerConfig(model,variant) {
  if(typeof model!=='string'||!/^openai\/[^/\s]+$/.test(model)||typeof variant!=='string'||!variant.trim())throw Error('Explicit OpenAI model and variant required; no fallback');
  const name=model.slice('openai/'.length);
  return {
    model,small_model:model,permission:config.permissions,
    agent:{build:{permission:{webfetch:'deny',websearch:'deny'}}},
    provider:{openai:{
      options:{baseURL:'http://127.0.0.1:4099/v1',apiKey:'owned-relay-no-credential'},
      models:{[name]:{name,variants:{[variant]:{reasoningEffort:variant}}}},
    }},
  };
}

export function prepare({output,model,variant,toolchain,bundle,executionImage,fixture=false,preflightReceipt,installedReceipt,deadlineReceipt,authorizeModelRuns=false}) {
  const nativeConfig=providerConfig(model,variant); // Fail before creating any input.
  if(authorizeModelRuns&&(fixture||output!==realBatch||model!=='openai/gpt-5.6-luna'||variant!=='high'))throw Error('Authorization only covers the exact canonical development configuration');
  if(![output,toolchain,bundle].every(p=>typeof p==='string'&&path.isAbsolute(p))||!/^sha256:[a-f0-9]{64}$/.test(executionImage??''))throw Error('Absolute output/toolchain/bundle and immutable image required');
  if(fs.existsSync(output))throw Error('Existing preparation cannot be replaced');
  validateBundle(bundle,{executionImage});
  let receipt=null;
  if(!fixture) {
    if(!preflightReceipt||!path.isAbsolute(preflightReceipt))throw Error('Explicit model-free preflight receipt required');
    receipt=JSON.parse(fs.readFileSync(preflightReceipt));
    if(receipt.preparationSha256!==hashFile(path.join(directory,'frozen-manifest.json')).sha256||receipt.suite!==config.suite||receipt.passed!==true||receipt.modelFree!==true||receipt.realProviderCalls!==0||JSON.stringify(receipt.inputHashes)!==JSON.stringify(manifest(path.join(directory,'tasks')))||!tasks.every(task=>{const row=receipt.tasks.find(r=>r.task===task.id);return row?.results.baseline.R===false&&row?.results.gold.R===true&&row?.results.wrong.R===false;}))throw Error('Unproven or stale model-free receipt');
    if(authorizeModelRuns) {
      const env=receipt.executionEnvironment,binarySha256=hashFile(path.join(toolchain,'package/bin/opencode')).sha256;
      if(!receipt.contained||env?.executionImage!==executionImage||env.nodeVersion!==config.nodeVersion||env.runtimeVersion!==config.runtimeVersion||env.binarySha256!==binarySha256||receipt.tasks[0].results['discount-field-loss']?.R!==false||receipt.tasks[2].results['all-holds-refund']?.R!==false||!tasks.every(task=>{const row=receipt.tasks.find(r=>r.task===task.id);return row.results.gold.publicExit===0&&task.preservation.every(id=>row.results.baseline.obligations.find(o=>o.id===id)?.status==='PASS');}))throw Error('Real execution requires matching contained controls and toolchain');
      if(![installedReceipt,deadlineReceipt].every(p=>typeof p==='string'&&path.isAbsolute(p)))throw Error('Installed scripted and deadline receipts required');
      const installed=JSON.parse(fs.readFileSync(installedReceipt)),deadline=JSON.parse(fs.readFileSync(deadlineReceipt)),bundleManifest=manifest(bundle);
      for(const check of [installed,deadline])if(check.passed!==true||check.realProviderCalls!==0||check.executionImage!==executionImage||check.binarySha256!==binarySha256||JSON.stringify(check.bundleManifest)!==JSON.stringify(bundleManifest))throw Error('Unproven or changed installed scripted environment');
      if(installed.bundleUnchanged!==true||installed.rows.length!==2||!config.arms.every(arm=>{const r=installed.rows.find(r=>r.arm===arm);return r?.delivery===true&&r.R===(arm==='D')&&r.corrections===(arm==='D'?1:0);})||deadline.controls.length!==2||!config.arms.every(arm=>{const c=deadline.controls.find(c=>c.arm===arm);return c?.hangIssued===true&&c.stop.terminationVerified===true&&c.stop.relayRemoved===true&&c.stop.activeProviderHandlers===0;}))throw Error('Unproven scripted completion/stop controls');
      if(command('git',['status','--porcelain'],repository).trim())throw Error('Commit executable code and public protocol before preparing real execution');
    }
  }
  const committed=JSON.parse(fs.readFileSync(path.join(directory,'frozen-manifest.json')));
  if(JSON.stringify(committed)!==JSON.stringify(frozenManifest()))throw Error('Suite/product changed since the stage-2 manifest');
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const inputRoot=path.join(output,'inputs');fs.mkdirSync(inputRoot);
  const selected=fixture?tasks.slice(0,1):tasks,inputs={};
  for(const task of selected) {
    const source=path.join(inputRoot,task.id);inputs[task.id]={source,manifest:prepareSource(task,source)};
    const accessible=dir=>{fs.chmodSync(dir,0o755);for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())accessible(p);else if(e.isFile())fs.chmodSync(p,fs.statSync(p).mode|0o444);}};accessible(source);
  }
  const attempts=(fixture?[{slot:1,task:tasks[0].id,arm:'direct'},{slot:2,task:tasks[0].id,arm:'D'}]:schedule).map(row=>({...row,source:inputs[row.task].source}));
  const files=Object.fromEntries([...Object.entries(committed.files),...Object.entries(committed.product)].map(([file,value])=>[path.join(repository,file),value.sha256]));
  const binary=path.join(toolchain,'package/bin/opencode');files[binary]=hashFile(binary).sha256;
  for(const file of [preflightReceipt,installedReceipt,deadlineReceipt].filter(Boolean))files[file]=hashFile(file).sha256;
  const f={experimentKind:fixture?'fixture':'feedback-development',suite:config.suite,model,variant,budgetMs:config.budgetMs,strategy:'per-slot',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,executionImage,runtimeVersion:config.runtimeVersion,nodeVersion:config.nodeVersion,preflightPassed:true,files,attempts,toolchain,template:bundle,runtimeManifests:{[bundle]:manifest(bundle),...Object.fromEntries(Object.values(inputs).map(i=>[i.source,i.manifest]))},inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,inputs[a.task].manifest])),config:nativeConfig,modelRunsAuthorized:authorizeModelRuns,...(authorizeModelRuns?{sourceCommit:command('git',['rev-parse','HEAD'],repository).trim()}: {})};
  privateJSON(path.join(output,'freeze.json'),f);
  if(authorizeModelRuns)privateJSON(path.join(output,'execution-manifest.json'),{suite:config.suite,acceptedHead:'f63bee5853a0babff838e53b23b9820b1043c667',sourceCommit:f.sourceCommit,freezeSha256:hashFile(path.join(output,'freeze.json')).sha256,model,variant,budgetMs:f.budgetMs,executionImage,executionEnvironment:receipt.executionEnvironment,bundleManifestSha256:createHash('sha256').update(JSON.stringify(manifest(bundle))).digest('hex'),dependenciesLockSha256:hashFile(path.join(bundle,'package-lock.json')).sha256,inputHashes:receipt.inputHashes,preflightSha256:hashFile(preflightReceipt).sha256,installedSha256:hashFile(installedReceipt).sha256,deadlineSha256:hashFile(deadlineReceipt).sha256,order:schedule,realProviderCallsBeforeFreeze:0});
  return f;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--freeze-plan') {
    privateJSON(path.join(directory,'frozen-manifest.json'),frozenManifest());
    console.log('Stage-2 contents frozen; model/variant/environment still unset.');
  }else {
    const options={};for(let i=0;i<args.length;i++){if(args[i]==='--authorize-model-runs'){options.authorizeModelRuns=true;continue;}if(!['--output','--model','--variant','--toolchain','--bundle','--image','--preflight','--installed','--deadline'].includes(args[i])||!args[i+1])throw Error('Usage: prepare.mjs --output ABS --model openai/ID --variant VARIANT --toolchain ABS --bundle ABS --image sha256:ID --preflight ABS_RECEIPT [--installed ABS --deadline ABS --authorize-model-runs]');options[args[i].slice(2)]=args[++i];}
    const f=prepare({...options,executionImage:options.image,preflightReceipt:options.preflight,installedReceipt:options.installed,deadlineReceipt:options.deadline});console.log(JSON.stringify({runs:f.attempts.length,model:f.model,variant:f.variant,budgetMs:f.budgetMs,modelRunsAuthorized:f.modelRunsAuthorized}));
  }
}
