// Fresh final-evaluation family; never used for product development.
// Three related tasks are one statistical cluster. Graders use only public
// behavioral contracts, independent of any product-generated acceptance tests.
const matcher = `export function match(pattern, pathname) {
 const expected=pattern.split('/').filter(Boolean), actual=pathname.split('/').filter(Boolean);
 if(expected.length!==actual.length)return null;
 const params={};
 for(let i=0;i<expected.length;i++) {
  if(expected[i].startsWith(':'))params[expected[i].slice(1)]=decodeURIComponent(actual[i]);
  else if(expected[i]!==actual[i])return null;
 }
 return params;
}
`;
const router = `import { match } from './match.mjs';
export class RouteTable {
 constructor() { this.routes=[]; }
 add(method, pattern, handler) { this.routes.push({method,pattern,handler}); return this; }
 dispatch(method, url) {
  const pathname=url.split('?')[0];
  for(const route of this.routes) {
   if(route.method!==method)continue;
   const params=match(route.pattern,pathname);
   if(params!==null)return {status:200,body:route.handler(params)};
  }
  return {status:404,body:null};
 }
}
`;
const adapter = `export function serve(table, request) { return table.dispatch(request.method,request.url); }
`;
const index = `export { RouteTable } from './router.mjs';
export { serve } from './adapter.mjs';
`;
const publicTest = `import test from 'node:test';import assert from 'node:assert/strict';import {RouteTable,serve} from '../src/index.mjs';
test('dispatch, parameters and adapter',()=>{const t=new RouteTable();assert.equal(t.add('GET','/users/:id',p=>p.id),t);assert.deepEqual(serve(t,{method:'GET',url:'/users/alice?x=1'}),{status:200,body:'alice'});assert.deepEqual(t.dispatch('POST','/users/alice'),{status:404,body:null});});
test('first registration and root',()=>{const t=new RouteTable().add('GET','/',()=>1).add('GET','/',()=>2);assert.equal(t.dispatch('GET','/').body,1);});
`;
const base = {
 'README.md':'RouteTable.add(method, pattern, handler) registers a synchronous route and returns this. dispatch(method, url) returns {status:200,body:handler(params)} or {status:404,body:null}. Method names are case-sensitive. The first matching registration wins. Paths split on / and ignore empty segments; query text is ignored. A :name segment binds a decoded parameter. Static segments are literal. Handler exceptions propagate. serve(table, request) is the adapter; src/index.mjs is the public entrypoint.\n',
 'src/match.mjs':matcher,'src/router.mjs':router,'src/adapter.mjs':adapter,'src/index.mjs':index,
 'test/public.test.mjs':publicTest,
};
const imports = `import test from 'node:test';import assert from 'node:assert/strict';import {RouteTable,serve} from '/workspace/src/index.mjs';\n`;
export const tasks = [
 {
  id:'route-malformed-parameter',family:'route-table',stratum:'public-reproducer',
  task:'Fix malformed percent-encoded dynamic route parameters. A route whose dynamic segment cannot be decoded must be treated as a non-match, without throwing URIError or invoking that route handler. Continue looking for a later matching route, including a literal path containing the same raw percent characters. Preserve first-match registration order, method filtering, query ignoring and handler-error propagation. Valid parameters must be decoded exactly once: encoded slash stays within one parameter and plus remains plus. Keep serve and the public exports compatible.',
  files:{...base,'test/public.test.mjs':publicTest+`test('malformed parameter is a non-match',()=>{const t=new RouteTable().add('GET','/users/:id',p=>p.id);let result;assert.doesNotThrow(()=>{result=t.dispatch('GET','/users/%ZZ');});assert.deepEqual(result,{status:404,body:null});});\n`},
  hidden:imports+`test('bad encodings never invoke dynamic handlers and permit literal fallback',()=>{for(const value of ['%','%ZZ','%E0%A4%A']){let called=0;const t=new RouteTable().add('GET','/x/:value',()=>{called++;}).add('GET','/x/'+value,()=> 'literal');let result;assert.doesNotThrow(()=>{result=serve(t,{method:'GET',url:'/x/'+value});});assert.deepEqual(result,{status:200,body:'literal'});assert.equal(called,0);}});
test('decode once and retain segment boundaries',()=>{const t=new RouteTable().add('GET','/x/:v',p=>p.v);for(const [raw,want] of [['a%2Fb','a/b'],['%252F','%2F'],['a+b','a+b'],['caf%C3%A9','café']])assert.equal(t.dispatch('GET','/x/'+raw+'?ignored=%ZZ').body,want);});
test('do not swallow handler errors or change method selection',()=>{const reason={sentinel:true};const t=new RouteTable().add('GET','/x/:v',()=>{throw reason;});assert.throws(()=>t.dispatch('GET','/x/valid'),e=>e===reason);assert.deepEqual(t.dispatch('POST','/x/%'),{status:404,body:null});});
`,
  reference:{'src/match.mjs':`export function match(pattern, pathname) {
 const expected=pattern.split('/').filter(Boolean),actual=pathname.split('/').filter(Boolean);
 if(expected.length!==actual.length)return null;
 const params={};
 for(let i=0;i<expected.length;i++) {
  if(expected[i].startsWith(':')) { let value;try{value=decodeURIComponent(actual[i]);}catch{return null;}params[expected[i].slice(1)]=value; }
  else if(expected[i]!==actual[i])return null;
 }
 return params;
}
`},
  alternative:{'src/match.mjs':`export function match(pattern, pathname) {
 const tokens=pattern.split('/').filter(Boolean), pieces=pathname.split('/').filter(Boolean);
 if(tokens.length!==pieces.length)return null;
 const pairs=[];
 for(const [i,token] of tokens.entries()) {
  if(!token.startsWith(':')) {if(token!==pieces[i])return null;continue;}
  try {pairs.push([token.slice(1),decodeURIComponent(pieces[i])]);} catch(error){if(error instanceof URIError)return null;throw error;}
 }
 return Object.fromEntries(pairs);
}
`},
 },
 {
  id:'route-head-fallback',family:'route-table',stratum:'uncovered-requirement',
  task:'Add HEAD support to RouteTable.dispatch and serve. For HEAD, first search matching explicitly registered HEAD routes using existing registration order; only when none matches search GET routes for that path. Invoke only the selected handler, preserving side effects and thrown errors, but always omit its body from the response by returning body:undefined. A missing HEAD route and fallback returns status:404,body:undefined. Other methods retain their existing behavior, including 404 body:null. Preserve query ignoring, dynamic parameters, add chaining and public exports.',
  files:base,
  hidden:imports+`test('HEAD falls back through serve and suppresses body',()=>{let calls=0;const t=new RouteTable().add('GET','/item/:id',p=>{calls++;return p.id;});assert.deepEqual(serve(t,{method:'HEAD',url:'/item/a%20b?x=1'}),{status:200,body:undefined});assert.equal(calls,1);assert.equal(t.dispatch('GET','/item/a').body,'a');});
test('explicit HEAD precedes all GET candidates even when registered later',()=>{const seen=[];const t=new RouteTable().add('GET','/x/:id',()=>seen.push('get')).add('HEAD','/else',()=>seen.push('wrong')).add('HEAD','/x/:id',p=>seen.push(p.id)).add('HEAD','/x/:id',()=>seen.push('late'));assert.deepEqual(t.dispatch('HEAD','/x/z'),{status:200,body:undefined});assert.deepEqual(seen,['z']);});
test('missing and exceptional routes preserve precise behavior',()=>{const t=new RouteTable();assert.deepEqual(t.dispatch('HEAD','/no'),{status:404,body:undefined});assert.deepEqual(t.dispatch('POST','/no'),{status:404,body:null});const reason=new Error('handler');t.add('GET','/err',()=>{throw reason;});assert.throws(()=>t.dispatch('HEAD','/err'),e=>e===reason);});
`,
  reference:{'src/router.mjs':`import {match} from './match.mjs';
export class RouteTable {
 constructor(){this.routes=[];}
 add(method,pattern,handler){this.routes.push({method,pattern,handler});return this;}
 dispatch(method,url){const pathname=url.split('?')[0];for(const wanted of method==='HEAD'?['HEAD','GET']:[method]){for(const route of this.routes){if(route.method!==wanted)continue;const params=match(route.pattern,pathname);if(params!==null){const body=route.handler(params);return {status:200,body:method==='HEAD'?undefined:body};}}}return {status:404,body:method==='HEAD'?undefined:null};}
}
`},
  alternative:{'src/router.mjs':`import {match} from './match.mjs';
export class RouteTable {
 constructor(){this.routes=[];}
 add(method,pattern,handler){this.routes.push({method,pattern,handler});return this;}
 dispatch(method,url){
 const path=url.split('?')[0];
 const select=wanted=>{for(const r of this.routes){if(r.method!==wanted)continue;const params=match(r.pattern,path);if(params!==null)return {r,params};}return undefined;};
 const hit=select(method)??(method==='HEAD'?select('GET'):undefined);
 if(!hit)return {status:404,body:method==='HEAD'?undefined:null};
 const value=hit.r.handler(hit.params);
 return {status:200,body:method==='HEAD'?undefined:value};
 }
}
`},
 },
 {
  id:'route-request-context',family:'route-table',stratum:'multi-file-obligation',
  task:'Extend route handlers to receive (params, context). RouteTable.dispatch accepts an optional third context argument and forwards that exact object identity to the chosen handler, without mutation. Legacy dispatch without context still works and supplies undefined. Extend serve(table, request, context) to pass the same third argument. Export a new createHandler(table, context) from both adapter.mjs and the public index; it returns a function accepting a request and dispatching through serve with that bound context. Each created handler binds its own context, preserves status/body and synchronous thrown errors, and must not modify the request, context or table. Preserve all existing route matching and first-registration behavior.',
  files:base,
  hidden:imports+`import * as entry from '/workspace/src/index.mjs';import * as adapter from '/workspace/src/adapter.mjs';const createHandler=(...args)=>{assert.equal(typeof entry.createHandler,'function');return entry.createHandler(...args);};const direct=(...args)=>{assert.equal(typeof adapter.createHandler,'function');return adapter.createHandler(...args);};
test('context identity crosses dispatch and serve',()=>{const ctx=Object.freeze({identity:1});const request=Object.freeze({method:'GET',url:'/x/v'});const t=new RouteTable().add('GET','/x/:v',(p,c)=>({p:p.v,same:c===ctx}));assert.deepEqual(t.dispatch('GET','/x/v',ctx).body,{p:'v',same:true});assert.deepEqual(serve(t,request,ctx).body,{p:'v',same:true});});
test('bound adapters keep independent context and legacy undefined',()=>{const a={},b={};const t=new RouteTable().add('GET','/',(_p,c)=>c);const req=Object.freeze({method:'GET',url:'/'});const ha=createHandler(t,a),hb=direct(t,b);assert.equal(ha(req).body,a);assert.equal(hb(req).body,b);assert.equal(ha(req).body,a);assert.equal(t.dispatch('GET','/').body,undefined);assert.equal(serve(t,req).body,undefined);});
test('missing routes and thrown errors pass through bound consumer',()=>{const err={failure:true};const t=new RouteTable().add('GET','/bad',()=>{throw err;});const h=createHandler(t,Object.freeze({}));assert.deepEqual(h({method:'GET',url:'/missing'}),{status:404,body:null});assert.throws(()=>h({method:'GET',url:'/bad'}),e=>e===err);});
`,
  reference:{'src/router.mjs':router.replace('dispatch(method, url)', 'dispatch(method, url, context)').replace('route.handler(params)','route.handler(params,context)'),
   'src/adapter.mjs':`export function serve(table,request,context){return table.dispatch(request.method,request.url,context);}
export function createHandler(table,context){return request=>serve(table,request,context);}
`,
   'src/index.mjs':`export {RouteTable} from './router.mjs';export {serve,createHandler} from './adapter.mjs';\n`},
  alternative:{'src/router.mjs':`import {match} from './match.mjs';
export class RouteTable {
 constructor(){this.routes=[];}
 add(method,pattern,handler){this.routes.push({method,pattern,handler});return this;}
 dispatch(method,url,...args){const pathname=url.split('?')[0];for(const registration of this.routes){if(registration.method!==method)continue;const params=match(registration.pattern,pathname);if(params===null)continue;return {status:200,body:Reflect.apply(registration.handler,registration,[params,args[0]])};}return {status:404,body:null};}
}
`,
   'src/adapter.mjs':`export function serve(table,request,context){const {method,url}=request;return table.dispatch(method,url,context);}
export function createHandler(table,context){function bound(request){return serve(table,request,context);}return bound;}
`,
   'src/index.mjs':`export {RouteTable} from './router.mjs';export * from './adapter.mjs';\n`},
 },
];
