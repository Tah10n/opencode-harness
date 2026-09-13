import ts from 'typescript';import fs from 'node:fs';import path from 'node:path';import {projectCheck} from '../native-task-ab/project-check.mjs';import {runtimeControl} from './control-patches.mjs';import {cases} from './evaluation-cases.mjs';
export function fullControl(task,source,variant){
 let body=cases[task.id].replaceAll('new api(', 'new QuickLRU(');
 if(task.project==='quick-lru')body=ts.createPrinter().printFile(ts.createSourceFile('case.js',body.replace('const ev=[],q=', 'const ev=[]; const q=').replace(/\be\b/g,'error').replaceAll(';',';\n').replaceAll('{','{\n').replaceAll('}','\n}'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS));
 else body=cases[task.id];
 if(task.project==='fastq'){body=body.replace('let resolve,reject;', 'let resolveFirst,rejectSecond;').replace('(yes,no)=>{if(v===1)resolve=yes;else reject=no;}', '(resolve,reject)=>{if(v===1)resolveFirst=resolve;else rejectSecond=reject;}').replace('resolve(8);','resolveFirst(8);').replace('reject(failure);','rejectSecond(failure);').replace('()=>finished=true','()=>{finished=true;}').replace('()=>completed=true','()=>{completed=true;}');}
 const overlay=runtimeControl(task.id,source,variant),read=n=>overlay[n]??fs.readFileSync(path.join(source,n),'utf8');
 const docs=task.project==='quick-lru'?'readme.md':'README.md';overlay[docs]=read(docs)+'\n\n## '+task.id+'\n\n'+fs.readFileSync(task.taskFile,'utf8').split('\n\n')[0].replace(/^Add /,'The API provides ')+'\n';
 const typeFile='index.d.ts';
 if(task.project==='denque'){
  overlay[typeFile]=read(typeFile).replace('  toArray(): T[];',`  toArray(): T[];\n  ${task.id==='denque-rotate'?'rotate(steps?: number): this;':'removeWhere(predicate: (value: T, index: number) => unknown): number;'}`);
  overlay['test/type/index.ts']=read('test/type/index.ts')+(task.id==='denque-rotate'?'\nconst rotated: Denque<string> = queue.rotate(3).rotate();\n':'\nconst removed: number = queue.removeWhere((value, index) => value.length > index);\n');
  overlay['test/h00-contract.js']="var A = require('assert').strict; var api = require('../');\nit('new public contract', async function () {\n"+body+'\n});\n';
 }else if(task.project==='eventemitter3'){
  const method=task.id==='eventemitter-prepend'?['prependListener','prependOnceListener'].map(n=>`  ${n}<T extends EventEmitter.EventNames<EventTypes>>(event: T, fn: EventEmitter.EventListener<EventTypes, T>, context?: Context): this;`).join('\n'):'  removeListenersByContext(context: Context): number;';
  overlay[typeFile]=read(typeFile).replace('  static prefixed: string | boolean;','  static prefixed: string | boolean;\n'+method);
  overlay['test/test.js']=read('test/test.js')+"\nvar A = require('assert').strict; var api = require('../');\nit('new public contract', async function () {\n"+body.replace("await import('./index.mjs')","await import('../index.mjs')")+'\n});\n';
  overlay['test/h00-types.ts']=`import EventEmitter from '../index';\nconst emitter = new EventEmitter<{change: [string, number]}>();\n`+(task.id==='eventemitter-prepend'?`const chained: typeof emitter = emitter.prependListener('change', (text, count) => {const value: string = text;const size: number = count;}).prependOnceListener('change', (text, count) => {});\n// @ts-expect-error invalid payload type\nemitter.prependListener('change', (wrong: number) => {});\n`:'const removed: number = emitter.removeListenersByContext({});\n');
 }else if(task.project==='fastq'){
  const method=task.id==='fastq-running-tasks'?'runningTasks(): T[]':'onIdle(): Promise<void>';
  overlay[typeFile]=read(typeFile).replace('    running(): number','    '+method+'\n    running(): number');
  overlay['test/example.ts']=read('test/example.ts')+`\nconst addedQueue = fastq.promise(async (value: string) => value, 1);\n`+(task.id==='fastq-running-tasks'?'const snapshot: string[] = addedQueue.runningTasks();\n':'const idlePromise: Promise<void> = addedQueue.onIdle();\n');
  overlay['test/test.js']=read('test/test.js')+"\nvar A = require('assert').strict\nvar api = require('../')\ntest('new public contract', function (t) {\n  ;(async function () {\n"+body+"\n  })().then(function () { t.end() }, function (error) { t.fail(error.stack); t.end() })\n})\n";
 }else if(task.project==='quick-lru'){
  overlay[typeFile]=read(typeFile).replace('export default class QuickLRU', 'export default class QuickLRU');
  const needle='\n\tget(key: KeyType): ValueType | undefined;';if(!overlay[typeFile].includes(needle))throw Error('QuickLRU type anchor');
  overlay[typeFile]=overlay[typeFile].replace(needle,needle+'\n\t'+(task.id==='quick-lru-computed'?'getOrInsertComputed(key: KeyType, factory: (key: KeyType) => ValueType): ValueType;':'pruneExpired(): number;'));
  overlay['index.test-d.ts']=read('index.test-d.ts')+(task.id==='quick-lru-computed'?"\nexpectType<number>(lru.getOrInsertComputed('x', key => key.length));\n// @ts-expect-error invalid return value\nlru.getOrInsertComputed('x', () => 'bad');\n":"\nexpectType<number>(lru.pruneExpired());\n");
  overlay['test.js']=read('test.js')+"\nimport * as A from 'node:assert/strict';\ntest('new public contract', t => {\n"+body+'\n t.pass();\n});\n';
 }else if(task.project==='ufo'){
  overlay['test/h00-contract.test.ts']='// @ts-nocheck -- invalid runtime inputs are intentional; public types are tested separately.\nimport * as A from "node:assert/strict";\nimport {test} from "vitest";\nimport * as api from "../src";\ntest("new public contract", async () => {\n'+body+'\n});\n';
  overlay['test/types.test-d.ts']=read('test/types.test-d.ts')+'\nimport * as addedApi from "../src";\n'+(task.id==='ufo-query-sort'?'const opts: addedApi.StringifyQueryOptions = {sort: true};\nexpectTypeOf(addedApi.stringifyQuery({x:1}, opts)).toEqualTypeOf<string>();\nexpectTypeOf(addedApi.withQuery("/", {}, opts)).toEqualTypeOf<string>();\n// @ts-expect-error sort must be boolean\naddedApi.stringifyQuery({}, {sort: 1});\n':'expectTypeOf(addedApi.appendQuery("/", {x:[1,2]})).toEqualTypeOf<string>();\n// @ts-expect-error URL must be a string\naddedApi.appendQuery(123, {});\n');
 }else if(task.project==='ms'){
  overlay['src/h00-contract.test.ts']='// @ts-nocheck -- invalid runtime inputs are intentional; public types are tested separately.\nimport * as A from "node:assert/strict";\nimport {test} from "@jest/globals";\nimport * as api from "./index";\ntest("new public contract", async () => {\n'+body+'\n});\n';
  overlay['src/h00-types.ts']='import * as api from "./index";\n'+(task.id==='ms-format-unit'?'const options: api.Options = {unit:"s",long:true};\nconst text: string = api.ms(1000, options);\nconst parsed: number = api.ms("1s");\n// @ts-expect-error unknown unit\napi.format(1000, {unit:"unknown"});\n':'const value: number = api.parseCompound("1h 30m");\n// @ts-expect-error input must be string\napi.parseCompound(123);\n');
 }
 if(task.project==='ufo'){for(const name of Object.keys(overlay))if(name.endsWith('.ts')){overlay[name]=overlay[name].replace('([] as any[]).concat(merged[key], Array.isArray(value) ? value : [value ?? ""])','[...(Array.isArray(merged[key]) ? merged[key] : [merged[key]]), ...(Array.isArray(value) ? value : [value ?? ""])]').replace('([] as any[]).concat(merged[key], additions)','[...(Array.isArray(merged[key]) ? merged[key] : [merged[key]]), ...additions]').replace('a < b ? -1 : a > b ? 1 : 0', '{ if (a === b) return 0; return a < b ? -1 : 1; }');}}
 return overlay;
}
const commands={denque:'npm test',eventemitter3:'npm test && npm run test-esm',fastq:'npx --no-install eslint --fix queue.js test/test.js test/example.ts && npm test && npm run typescript','quick-lru':'npx --no-install xo --fix && npm test',ufo:'npm run lint:fix && PATH="$PWD/node_modules/.bin:$PATH" npm test && npm run build',ms:'PATH="$PWD/node_modules/.bin:$PATH" npm test && npm run typecheck && npm run build'};
if(process.argv[1]===new URL(import.meta.url).pathname){
 const root=path.resolve(process.argv[2]??'local/native-task-h00-transfer'),outputName=process.argv[3]??'full-controls';const tasks=JSON.parse(fs.readFileSync('development/native-task-h00-transfer/tasks.json')),rows=[];
 for(const t of tasks.filter(t=>!process.env.TASK_FILTER||process.env.TASK_FILTER.split(',').includes(t.id)))for(const variant of ['reference','alternative']){const source=root+'/inputs/'+t.id,overlay=fullControl(t,source,variant),result=await projectCheck({source,output:root+'/'+outputName+'/'+t.id+'/'+variant,toolchain:path.resolve('../verified-change-harness/local/template-toolchain-20260908'),overlay:Object.fromEntries(Object.entries(overlay).map(([n,v])=>[n,Buffer.from(v).toString('base64')])),command:['sh','-c',commands[t.project]],captureFiles:Object.keys(overlay)});rows.push({task:t.id,variant,...result});fs.writeFileSync(root+'/'+outputName+'/results.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.at(-1)));}
 if(rows.some(r=>r.exit!==0))process.exitCode=1;
}
