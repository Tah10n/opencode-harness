// Pre-freeze fixture validation only: no model submissions or scored outcomes.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {classifyCheck} from './grading.mjs';
const installed=process.argv[2];
if(!installed||!path.isAbsolute(installed))throw Error('Pass the absolute installed package directory');
const {runCheck}=await import(pathToFileURL(path.join(installed,'lib/checks.mjs')));
const {resolveImage}=await import(pathToFileURL(path.join(installed,'lib/sandbox.mjs')));
const {checkScope}=await import(pathToFileURL(path.join(installed,'lib/workspace.mjs')));
const image=await resolveImage('node:24.19.0-bookworm-slim');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'verified-change-fixture-validation-'));fs.chmodSync(root,0o700);
const corpus=fileURLToPath(new URL('./corpus/',import.meta.url));
let count=0;
for(const module of fs.readdirSync(corpus).filter(f=>f.endsWith('.mjs')&&(!process.argv[3]||f===process.argv[3])).sort()){
 const {tasks}=await import(pathToFileURL(path.join(corpus,module)));
 for(const task of tasks){
  const taskRoot=path.join(root,task.id);fs.mkdirSync(taskRoot);
  const grader=path.join(taskRoot,'grader');fs.mkdirSync(grader);fs.writeFileSync(path.join(grader,'hidden.test.mjs'),task.hidden);
  const records=[];
  for(const variant of ['baseline','reference','alternative']){
   const workspace=path.join(taskRoot,variant);fs.mkdirSync(workspace);
   for(const [file,bytes] of Object.entries({...task.files,...(task[variant]??{})})){const target=path.join(workspace,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
   const publicResult=await runCheck({id:'public',kind:'node-test',files:['test/public.test.mjs']},{image,workspace});
   const hiddenResult=await runCheck({id:'hidden',kind:'node-test',files:['hidden.test.mjs']},{image,workspace,checkRoot:'/grader',extraMounts:[{source:grader,target:'/grader'}]});
   const scope=variant==='baseline'?{passed:true}:checkScope({directory:workspace},path.join(taskRoot,'baseline'),['src']);
   const interpretation=classifyCheck(hiddenResult);
   const record={variant,publicResult,hiddenResult,interpretation,scope};records.push(record);
   fs.writeFileSync(path.join(taskRoot,variant+'-validation.json'),JSON.stringify(record,null,2),{mode:0o600});
   const expectedPublic=variant==='baseline'&&task.stratum==='public-reproducer'?'assertion_failed':'passed';
   if(publicResult.status!==expectedPublic)throw Error(`${task.id} ${variant} public ${publicResult.status}: ${JSON.stringify(publicResult)}`);
   const expectedSuccess=variant!=='baseline';
   if(!interpretation.available||interpretation.success!==expectedSuccess||!scope.passed)throw Error(`${task.id} ${variant} hidden ${hiddenResult.status}: ${JSON.stringify(hiddenResult)}`);
  }
  fs.writeFileSync(path.join(taskRoot,'validation.json'),JSON.stringify(records,null,2),{mode:0o600});
  count++;console.log(JSON.stringify({id:task.id,status:'references_and_invalid_baseline_validated',artifacts:taskRoot}));
 }
}
console.log(JSON.stringify({purpose:'pre-freeze-fixture-validation',count,root,image}));
