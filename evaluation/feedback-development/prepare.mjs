import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hashFile,privateJSON} from '../support/output-files.mjs';
import {manifest} from '../support/manifest.mjs';
import {tasks,schedule,config,directory,repository,prepareSource,frozenManifest} from './suite.mjs';
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

export function prepare({output,model,variant,toolchain,bundle,executionImage,fixture=false,preflightReceipt}) {
  const nativeConfig=providerConfig(model,variant); // Fail before creating any input.
  if(![output,toolchain,bundle].every(p=>typeof p==='string'&&path.isAbsolute(p))||!/^sha256:[a-f0-9]{64}$/.test(executionImage??''))throw Error('Absolute output/toolchain/bundle and immutable image required');
  if(fs.existsSync(output))throw Error('Existing preparation cannot be replaced');
  validateBundle(bundle);
  let receipt=null;
  if(!fixture) {
    if(!preflightReceipt||!path.isAbsolute(preflightReceipt))throw Error('Explicit model-free preflight receipt required');
    receipt=JSON.parse(fs.readFileSync(preflightReceipt));
    if(receipt.suite!==config.suite||receipt.passed!==true||receipt.modelFree!==true||receipt.realProviderCalls!==0||JSON.stringify(receipt.inputHashes)!==JSON.stringify(manifest(path.join(directory,'tasks')))||!tasks.every(task=>{const row=receipt.tasks.find(r=>r.task===task.id);return row?.results.baseline.R===false&&row?.results.gold.R===true&&row?.results.wrong.R===false;}))throw Error('Unproven or stale model-free receipt');
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
  if(preflightReceipt)files[preflightReceipt]=hashFile(preflightReceipt).sha256;
  const f={experimentKind:fixture?'fixture':'feedback-development',suite:config.suite,model,variant,budgetMs:config.budgetMs,strategy:'per-slot',streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,executionImage,runtimeVersion:config.runtimeVersion,preflightPassed:true,files,attempts,toolchain,template:bundle,runtimeManifests:{[bundle]:manifest(bundle),...Object.fromEntries(Object.values(inputs).map(i=>[i.source,i.manifest]))},inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,inputs[a.task].manifest])),config:nativeConfig,modelRunsAuthorized:false};
  privateJSON(path.join(output,'freeze.json'),f);
  return f;
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--freeze-plan') {
    privateJSON(path.join(directory,'frozen-manifest.json'),frozenManifest());
    console.log('Stage-2 contents frozen; model/variant/environment still unset.');
  }else {
    const options={};for(let i=0;i<args.length;i+=2){if(!['--output','--model','--variant','--toolchain','--bundle','--image','--preflight'].includes(args[i])||!args[i+1])throw Error('Usage: prepare.mjs --output ABS --model openai/ID --variant VARIANT --toolchain ABS --bundle ABS --image sha256:ID --preflight ABS_RECEIPT');options[args[i].slice(2)]=args[i+1];}
    const f=prepare({...options,executionImage:options.image,preflightReceipt:options.preflight});console.log(JSON.stringify({runs:f.attempts.length,model:f.model,variant:f.variant,budgetMs:f.budgetMs,modelRunsAuthorized:false}));
  }
}
