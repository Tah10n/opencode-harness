// Build reviewable full-delivery controls outside the author inputs. Project
// regressions run under each project's existing runner; no harness import path.
import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import {cases,types} from './evaluation-cases.mjs';
import {controlFiles} from './control-patches.mjs';
import {projectCheck} from './project-check.mjs';
const root=path.resolve(process.argv[2]),toolchain=path.resolve(process.argv[3]);
const tasks=JSON.parse(fs.readFileSync(new URL('./tasks.json',import.meta.url))).filter(t=>process.argv.length<5||process.argv.slice(4).includes(t.id));
const docs={
 'limit-function-controls':'The function returned by `limitFunction` exposes live readonly `activeCount` and `pendingCount` properties and a writable `concurrency` property. These refer to that wrapper only. Increasing concurrency admits queued work; validation is identical to `pLimit`. Existing `clearQueue` behavior is unchanged.',
 'clear-queue-reason':'`clearQueue(reason?)` accepts any rejection reason on the limiter and the `limitFunction` wrapper. With `rejectOnClear: true`, queued promises reject with the exact supplied non-undefined value. Omitting the reason or passing undefined uses the existing AbortError. With the option disabled, queued promises are discarded without settlement. Already-running work is unaffected; the limiter can be reused.',
 'bind-methods-atomic':'`bindMethods` preflights normal object conflicts before creating any bindings. A conflicting existing value, a non-configurable property or a missing property on a non-extensible object causes failure without partial binding. Duplicate method names bind once. A configurable undefined property remains replaceable with its writable/configurable flags preserved. New bound properties retain the normal non-enumerable, non-writable and non-configurable descriptors. The guarantee does not cover adversarial proxy traps or mutating getters.',
 'listener-count-deduplicate':'In `listenerCount([name, ...])`, repeated event-name values count once. Symbol identity is retained, so two distinct symbols with the same description count separately. Distinct names keep the existing additive counting semantics, including any-listeners and iterator producers. Single-name and no-argument calls are unchanged.',
 'abortable-queue-waiters':'`onEmpty({signal?})`, `onIdle({signal?})` and `onPendingZero({signal?})` support canceling the individual wait. They reject with the abort reason, including when the signal was already aborted before a condition was checked. Cancellation does not affect tasks or other waiters. Queue and abort listeners are removed after settlement. Existing calls without options keep their previous empty/idle/running-task semantics.',
 'clear-queue-count':'`clear()` returns the number of queued tasks discarded by that call. Active tasks are excluded; an empty or immediately repeated clear returns 0. Notifications, abort-listener cleanup and rate-limit history remain unchanged. The operation still does not cancel active work or settle the promises of discarded tasks, and supports the same custom queue classes.',
};
for(const task of tasks){
 const source=path.join(root,'inputs',task.id),files=controlFiles(task.id,source);
 let regression=cases[task.id].replaceAll("from './index.js'","from '../index.js'").replaceAll("from './source/index.ts'","from '../source/index.js'");
 const testFile=task.project==='p-queue'?'test/public-api-regression.ts':'test/public-api-regression.js';
 if(task.project!=='p-queue')regression=regression.replace("import {test} from 'node:test';","import test from 'ava';");
 regression=regression.replace(/\be\b/g,'emitterOrError').replace('const tick = () => new Promise(resolve => setImmediate(resolve));','const tick = () => new Promise(resolve => {setImmediate(resolve);});').replace('const deferred = () => {let resolve; const promise=new Promise(r=>{resolve=r}); return {promise,resolve}};','const deferred = () => Promise.withResolvers();');
 if(!regression.includes('getEventListeners('))regression=regression.replace("import {getEventListeners} from 'node:events';",'');
 if(!regression.includes('await tick()'))regression=regression.replace(/const tick = .*?;\n/,'');
 if(!regression.includes('=deferred()'))regression=regression.replace('const deferred = () => Promise.withResolvers();','');
if(task.id==='clear-queue-count')regression=regression.replace('items=[];','items: Array<{run: () => Promise<unknown>; options: unknown}> = [];').replace('setPriority(){}','setPriority(){throw new Error("Priority changes are not used by this fixture")}').replace('filter(){return this.items.map(x=>x.run)}','filter(){return [...this.items].map(x=>x.run)}').replace("test('paused/custom queue and discarded promise compatibility',{timeout:3000},async()=>{","for(const useCustom of [false,true])test('paused/custom queue and discarded promise compatibility '+useCustom,{timeout:3000},async()=>{").replace('for(const options of [{autoStart:false},{autoStart:false,queueClass:Custom}]){','{const options=useCustom?{autoStart:false,queueClass:Custom}:{autoStart:false};');
 files[testFile]=regression;
 // Tsd accepts *.test-d.ts files at its default root, and p-queue's test-d dir.
 const typeFile=task.project==='p-queue'?'test-d/public-api-regression.test-d.ts':'public-api-regression.test-d.ts';
 files[typeFile]=types[task.id].replaceAll("from './source/index.js'","from '../source/index.js'").replace(/\be\b/g,'emitter').replace('Symbol()','Symbol(\"key\")');
 if(task.id==='abortable-queue-waiters')files[typeFile]="import {expectType} from 'tsd';\n"+files[typeFile].replace('const checked:Promise<void>=p;','expectType<Promise<void>>(p);');
 if(task.id==='clear-queue-count')files[typeFile]="import {expectType} from 'tsd';\n"+files[typeFile].replace('const n:number=q.clear();','expectType<number>(q.clear());');
 files['readme.md']=fs.readFileSync(path.join(source,'readme.md'),'utf8')+'\n## Updated API behavior\n\n'+docs[task.id]+'\n';
 for(const name of [testFile,typeFile]){
  const sourceFile=ts.createSourceFile(name,files[name],ts.ScriptTarget.Latest,true);
  const transformed=ts.transform(sourceFile,[context=>{
   const visit=node=>{
    node=ts.visitEachChild(node,visit,context);
    if(ts.isBlock(node))node=ts.factory.createBlock(node.statements,true);
    if(ts.isArrowFunction(node) && ts.isBinaryExpression(node.body) && node.body.operatorToken.kind===ts.SyntaxKind.EqualsToken)node=ts.factory.updateArrowFunction(node,node.modifiers,node.typeParameters,node.parameters,node.type,node.equalsGreaterThanToken,ts.factory.createBlock([ts.factory.createExpressionStatement(node.body)],true));
    if(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text==='then')node=ts.factory.createCallExpression(ts.factory.createIdentifier('observe'),undefined,[node.expression.expression,...node.arguments]);
    if(task.project!=='p-queue' && name===testFile && ts.isCallExpression(node) && node.expression.getText(sourceFile)==='test'){
     const callback=node.arguments.at(-1);
     if(ts.isArrowFunction(callback)){
      const body=ts.factory.updateBlock(callback.body,[ts.factory.createExpressionStatement(ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('t'),'pass'),undefined,[])),...callback.body.statements]);
      ts.setEmitFlags(body,ts.EmitFlags.MultiLine);
      const next=ts.factory.updateArrowFunction(callback,callback.modifiers,callback.typeParameters,[ts.factory.createParameterDeclaration(undefined,undefined,'t')],callback.type,callback.equalsGreaterThanToken,body);
      node=ts.factory.updateCallExpression(node,node.expression,node.typeArguments,[node.arguments[0],next]);
     }
    }
    if(ts.isVariableStatement(node)&&node.declarationList.declarations.length>1)return node.declarationList.declarations.map(d=>ts.factory.createVariableStatement(node.modifiers,ts.factory.createVariableDeclarationList([d],node.declarationList.flags)));
    return node;
   };return node=>ts.visitNode(node,visit);
  }]);
  files[name]=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(transformed.transformed[0]);
  transformed.dispose();
  files[name]=files[name].replaceAll(';',';\n');
  if(files[name].includes('observe('))files[name]+=`
async function observe(promise, onFulfilled, onRejected) {
 let value;
 try {value = await promise;} catch (error) {
  if (!onRejected) {throw error;}
  return onRejected(error);
 }
 return onFulfilled(value);
}
`.replaceAll(';',';\n');
 }
 const output=path.join(root,process.env.FULL_CONTROL_DIRECTORY??'full-controls-split',task.id);
 const overlay=Object.fromEntries(Object.entries(files).map(([n,b])=>[n,Buffer.from(b).toString('base64')]));
 const command=['sh','-c',process.env.FULL_CONTROL_COMMAND??'node node_modules/xo/dist/cli.js --fix && npm test'];
 const result=await projectCheck({source,output,toolchain,command,overlay,captureFiles:Object.keys(files)});
 console.log(JSON.stringify({task:task.id,...result}));
}
