// Offline only. This evaluator and reference projects never enter a model container.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=path.dirname(new URL(import.meta.url).pathname);
export function disableTransition(source,task){
 const editor=task==='editor-precompleted',file=path.join(source,'src',editor?'editor.mjs':'worker.mjs'),original=path.join(source,'src','diagnostic-original.mjs');
 assert.ok(!fs.existsSync(original));fs.renameSync(file,original);
 // Wrap the public entry point and replace only its store operation. Return success-shaped
 // values, leaving setup operations, loading and other behavior intact. No source-text matching.
 fs.writeFileSync(file,editor?`export * from './diagnostic-original.mjs';import {apply as real} from './diagnostic-original.mjs';export const apply=(store,actions)=>real(new Proxy(store,{get(t,k){return k==='cancel'?id=>Object.hasOwn(t.read().staged,id):Reflect.get(t,k);}}),actions);\n`:`export * from './diagnostic-original.mjs';import {work as real} from './diagnostic-original.mjs';export const work=(q,...args)=>real(new Proxy(q,{get(t,k){return k==='retry'?id=>t.snapshot().leased.some(j=>j.id===id):Reflect.get(t,k);}}),...args);\n`);
}
function run(source,args=['--test']){const r=spawnSync(process.execPath,args,{cwd:source,encoding:'utf8',timeout:30000});return {exit:r.status,stdout:r.stdout,stderr:r.stderr,signal:r.signal};}
export async function behavior(source,task){
 const url=file=>pathToFileURL(path.join(source,'src',file)).href;
 if(task==='editor-precompleted'){
  const {drafts}=await import(url('drafts.mjs')),{apply}=await import(url('editor.mjs'));const s=drafts();s.stage('x','old');assert.deepEqual(apply(s,[{type:'publish',id:'x'}]),[true]);assert.deepEqual(s.read(),{staged:{},published:{x:'old'}});s.stage('x','new');s.stage('other','keep');assert.deepEqual(apply(s,[{type:'cancel',id:'x'}]),[true]);assert.deepEqual(s.read(),{staged:{other:'keep'},published:{x:'old'}});assert.deepEqual(apply(s,[{type:'cancel',id:'missing'},{type:'unknown',id:'other'}]),[false,false]);assert.deepEqual(s.read(),{staged:{other:'keep'},published:{x:'old'}});
  s.stage('x','new');assert.deepEqual(apply(s,[{type:'cancel',id:'x'},{type:'publish',id:'x'},{type:'publish',id:'other'}]),[true,false,true]);assert.deepEqual(s.read(),{staged:{},published:{x:'old',other:'keep'}});
 }else{
  const {queue}=await import(url('queue.mjs')),{work}=await import(url('worker.mjs'));const q=queue([{id:'a',payload:{n:1}},{id:'b',payload:2}]);let seen=[];assert.deepEqual(work(q,j=>{seen.push(j);return false;}),{sent:[],retried:['a']});assert.deepEqual(seen,[{id:'a',payload:{n:1}}]);assert.deepEqual(q.snapshot(),{ready:[{id:'b',payload:2},{id:'a',payload:{n:1}}],leased:[]});assert.deepEqual(work(q,()=>true),{sent:['b'],retried:[]});assert.deepEqual(work(q,()=>true),{sent:['a'],retried:[]});assert.deepEqual(q.snapshot(),{ready:[],leased:[]});assert.deepEqual(work(q,()=>assert.fail('empty send')),{sent:[],retried:[]});assert.deepEqual(q.snapshot(),{ready:[],leased:[]});
 }
}
export async function evaluate(source,task){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'directed-stateful-'));
 try{const copy=path.join(temp,'project');fs.cpSync(source,copy,{recursive:true,filter:p=>path.basename(p)!=='.git'});const ordinary=run(copy);let contract;try{await behavior(copy,task);contract={passed:true};}catch(e){contract={passed:false,error:e.message};}disableTransition(copy,task);const disabled=run(copy);const semanticFailure=disabled.exit===1&&/ERR_ASSERTION|AssertionError/.test(disabled.stdout+disabled.stderr)&&!/SyntaxError|ERR_MODULE_NOT_FOUND|Cannot find module/.test(disabled.stdout+disabled.stderr);return {ordinary,contract,disabled,semanticFailure};}finally{fs.rmSync(temp,{recursive:true,force:true});}
}
async function preflight(){const results=[];
 for(const task of ['queue-lost-retry','editor-precompleted','queue-valid-empty']){
  for(const kind of ['initial','reference','alternative']){const r=await evaluate(path.join(root,'tasks',task,kind),task);assert.equal(r.ordinary.exit,0,task+kind+r.ordinary.stdout);assert.equal(r.contract.passed,true,task+kind+JSON.stringify(r.contract));assert.equal(r.disabled.exit,kind==='initial'&&task!=='queue-valid-empty'?0:1,task+kind+r.disabled.stdout);if(r.disabled.exit===1)assert.ok(r.semanticFailure);results.push({task,kind,...r});}
  if(task!=='queue-valid-empty'){
   const temp=fs.mkdtempSync(path.join(os.tmpdir(),'guarded-setup-'));try{const d=path.join(temp,'project');fs.cpSync(path.join(root,'tasks',task,'initial'),d,{recursive:true});const editor=task==='editor-precompleted',file=path.join(d,'test',editor?'editor.test.mjs':'worker.test.mjs'),text=fs.readFileSync(file,'utf8');const before=editor?" apply(s,[{type:'cancel',id:'x'}]);":' const expected=q.snapshot().ready.map(x=>x.id);';assert.ok(text.includes(before));fs.writeFileSync(file,text.replace(before,(editor?" assert.equal(s.read().staged.x,'replacement');\n":" assert.deepEqual(q.snapshot().ready,[{id:'a',payload:1}]);\n")+before));const r=run(d);assert.equal(r.exit,1,r.stdout);assert.match(r.stdout,/ERR_ASSERTION|AssertionError/);results.push({task,kind:'guard-detects-broken-setup',...r});}finally{fs.rmSync(temp,{recursive:true,force:true});}
   const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'before-only-'));try{const d=path.join(tmp,'project');fs.cpSync(path.join(root,'tasks',task,'initial'),d,{recursive:true});const editor=task==='editor-precompleted';fs.writeFileSync(path.join(d,'test',editor?'editor.test.mjs':'worker.test.mjs'),editor?`import assert from 'node:assert/strict';import {drafts} from '../src/drafts.mjs';import {apply} from '../src/editor.mjs';const s=drafts();s.stage('x','replacement');assert.equal(s.read().staged.x,'replacement');apply(s,[{type:'cancel',id:'x'}]);`:`import assert from 'node:assert/strict';import {queue} from '../src/queue.mjs';import {work} from '../src/worker.mjs';const q=queue([{id:'a',payload:1}]);assert.deepEqual(q.snapshot().ready,[{id:'a',payload:1}]);work(q,()=>false);`);disableTransition(d,task);const r=run(d);assert.equal(r.exit,0,r.stdout);results.push({task,kind:'precondition-only-disabled',...r});}finally{fs.rmSync(tmp,{recursive:true,force:true});}
  }else{const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'valid-idle-'));try{fs.cpSync(path.join(root,'tasks',task,'initial'),tmp,{recursive:true});disableTransition(tmp,task);const r=run(tmp,['--test','--test-name-pattern=idle']);assert.equal(r.exit,0,r.stdout);results.push({task,kind:'valid-idle-disabled',...r});}finally{fs.rmSync(tmp,{recursive:true,force:true});}}
 }
 return {passed:true,realProviderRequests:0,results,limitations:'Bounded public-entry-point mutation and one alternative per task; not an exhaustive proof over all possible implementations. Manual patch review supplements these checks.'};
}
if(process.argv[2]==='--preflight')console.log(JSON.stringify(await preflight(),null,2));
else if(process.argv[2]==='--behavior'){await behavior(path.resolve(process.argv[3]),process.argv[4]);console.log('contract passed');}
else if(process.argv[2])console.log(JSON.stringify(await evaluate(path.resolve(process.argv[2]),process.argv[3]),null,2));
