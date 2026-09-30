// Model-free schedule contract: fixed P/C/T allocation, equal preparation exclusion,
// isolated arm bundles and no provider/credential discovery.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {manifest} from '../support/manifest.mjs';
import {runComparison} from '../support/scheduler.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'consolidated-schedule-'));
try{
 const source=root+'/source';fs.mkdirSync(source);fs.writeFileSync(source+'/TASK.md','Scripted scheduler contract only.');
 fs.mkdirSync(source+'/test/node_modules',{recursive:true});fs.symlinkSync('../..',source+'/test/node_modules/self');
 fs.symlinkSync('test',source+'/internal');
 const input=manifest(source);assert.deepEqual(input['test/node_modules/self'],{symlink:'../..'});
 let actualInputScript;
 const arms=['P','C','T'];const attempts=Array.from({length:20},(_,i)=>arms.slice(i%3).concat(arms.slice(0,i%3)).map((arm,j)=>({slot:i*3+j+1,task:'task-'+i,arm,source,preparationStatus:i===0?'preparation_error':'ready'}))).flat();
 const freeze={experimentKind:'polybench',campaign:'consolidated-v1',model:'openai/gpt-5.6-luna',variant:'high',strategy:'direct',budgetMs:1800000,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,preflightPassed:true,templates:{P:'plain-only',C:'core-only',T:'task-only'},files:{},attempts,inputManifests:Object.fromEntries(attempts.map(a=>[a.task+'-'+a.arm,input]))};
 const execute=async(f,folder,seen)=>{
  fs.mkdirSync(folder);fs.writeFileSync(folder+'/freeze.json',JSON.stringify(f));
  return runComparison({root:folder,fetchImpl:()=>{throw Error('No provider call allowed');},readAuth:()=>{throw Error('No auth read allowed');},
   startContainer:async options=>{
    const a=f.attempts.find(a=>options.output.endsWith('/'+a.task+'-'+a.arm+'/session'));assert.ok(a);assert.equal(options.template,f.templates[a.arm]);seen.push(a.slot);
    return {setTaskBudget(){},exec(argv){if(argv[2]?.includes("visit('/work/repo')")){actualInputScript=argv[2].replaceAll('/work/repo',source);return spawnSync(process.execPath,['-e',actualInputScript],{encoding:'utf8'});}return {status:0,stdout:argv[0]==='/opt/opencode'?'1.18.26':argv[2].includes('DatabaseSync')?' {"sessions":[],"messages":[],"tools":[]}':''};},close(){return 0;}};
   },runTaskImplementation:async()=>({nativeCompleted:true,termination:{terminationVerified:true}}),stopWorkload:()=>({terminationVerified:true}),captureCandidate:()=>({status:0})});
 };
 const seen=[];assert.equal((await execute(freeze,root+'/good',seen)).status,'finished');
 assert.deepEqual(seen,Array.from({length:57},(_,i)=>i+4));
 for(const target of ['../outside','../source-sibling','/outside']){
  fs.symlinkSync(target,source+'/escape');
  assert.throws(()=>manifest(source),/External symlink/);
  const rejected=spawnSync(process.execPath,['-e',actualInputScript],{encoding:'utf8'});
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/External dependency link/);
  fs.unlinkSync(source+'/escape');
 }
 for(const [name,mutate]of [['mixed-preparation',f=>{f.attempts[0].preparationStatus='ready';}],['wrong-order',f=>{f.attempts[4].arm='P';}],['wrong-count',f=>{f.attempts.pop();}],['missing-bundle',f=>{delete f.templates.C;}]]){
  const f=structuredClone(freeze);mutate(f);const started=[];
  await assert.rejects(execute(f,root+'/'+name,started));assert.deepEqual(started,[]);
 }
 console.log('Consolidated fixed schedule, equal exclusions and arm bundles passed; provider requests: 0');
}finally{fs.rmSync(root,{recursive:true,force:true});}
