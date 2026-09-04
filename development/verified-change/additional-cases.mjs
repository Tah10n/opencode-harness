// Development only. Related scenarios intentionally share public repository
// families; none of these repositories or requests may enter final evaluation.
export const cases = {};
function family(name, files, requests) {
  for (const [suffix, task] of Object.entries(requests)) cases[`${name}-${suffix}`] = { files, task };
}
family('cache', {
  'README.md': 'A small asynchronous cache. Public callers use loadUser or Cache directly. Values may be undefined. Preserve existing exports and injected clock behavior.\n',
  'src/cache.mjs': `export class Cache {
  constructor(clock = Date.now) { this.clock = clock; this.entries = new Map(); }
  async get(key, loader, ttl = 1000) {
    const entry = this.entries.get(key);
    if (entry && entry.expires > this.clock()) return entry.value;
    const value = await loader(key);
    this.entries.set(key, { value, expires: this.clock() + ttl });
    return value;
  }
  delete(key) { return this.entries.delete(key); }
}
`,
  'src/users.mjs': `import { Cache } from './cache.mjs';
export const cache = new Cache();
export function loadUser(id, fetchUser, options = {}) { return cache.get(id, fetchUser, options.ttl); }
export { Cache } from './cache.mjs';
`,
  'test/public.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import { Cache } from '../src/users.mjs';
test('cache and expiry', async () => { let now=0, calls=0; const c=new Cache(()=>now); const load=async()=>++calls; assert.equal(await c.get('x',load,10),1); assert.equal(await c.get('x',load,10),1); now=10; assert.equal(await c.get('x',load,10),2); });
`,
}, {
  coalescing: 'Coalesce concurrent Cache.get calls for the same key into one loader invocation. Different keys remain independent. Every waiter receives the value or original rejection. A rejected load must not be cached and the next call must retry. Keep TTL measured from successful completion using the injected clock; undefined is a cacheable value. Preserve loadUser and Cache exports and existing get arguments.',
  invalidation: 'Make Cache.delete invalidate both stored values and in-flight loads. A load started before delete may resolve to its existing callers but must not repopulate the cache. A subsequent get starts a fresh load. Add invalidateUser(id) to users.mjs using its exported cache; preserve delete boolean semantics for stored values. Ensure overlapping old/new completion cannot overwrite the fresh cached value, including delete on a key with no stored entry.',
  bypass: 'Extend Cache.get with a fourth options argument containing bypass. With bypass:true, call the loader directly without reading or updating cached entries, including when the loader rejects; preserve its result or rejection. Forward loadUser options.bypass while preserving options.ttl and legacy callers. Reject non-finite or negative ttl with TypeError before invoking the loader, even on a cache hit. TTL zero is valid and does not retain a usable entry.',
});
family('events', {
  'README.md': 'Synchronous event hub. emit returns the number of listeners invoked. Listener exceptions propagate. subscribe returns an unsubscribe function. Events are arbitrary strings.\n',
  'src/hub.mjs': `export class Hub {
  constructor() { this.listeners = new Map(); }
  subscribe(event, fn) {
    const list = this.listeners.get(event) || []; list.push(fn); this.listeners.set(event,list);
    return () => { const at=list.indexOf(fn); if(at>=0) list.splice(at,1); };
  }
  emit(event, value) { const list=this.listeners.get(event)||[]; for(const fn of [...list]) fn(value); return list.length; }
}
`,
  'src/bridge.mjs': `export function watch(hub, callback) { return hub.subscribe('update', callback); }
export { Hub } from './hub.mjs';
`,
  'test/public.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import { Hub, watch } from '../src/bridge.mjs';
test('bridge and unsubscribe',()=>{ const h=new Hub(), seen=[]; const off=watch(h,v=>seen.push(v)); h.emit('update',1); off(); off(); h.emit('update',2); assert.deepEqual(seen,[1]); });
`,
}, {
  once: 'Add subscribe(event, fn, {once:true}) and forward optional watch options. A once subscription is removed before invocation so recursive emit cannot invoke it again, even when the callback throws. Separate subscriptions of the same function remain independent. Preserve synchronous exception propagation and unsubscribe idempotence. emit returns the actual number invoked when it returns normally; subscribers added during emit wait until the next emit.',
  cancellation: 'Support an optional AbortSignal as subscribe options.signal and watch options.signal. Already-aborted subscriptions are never registered. Abort removes only that subscription, including duplicate function subscriptions. Unsubscribe and abort are idempotent, and abort listeners are removed after unsubscribe. A listener removed before its turn during emit must not execute. Preserve listener insertion order and return the count actually invoked.',
  wildcard: 'Add subscribeAll(fn) to Hub and export watchAll(hub, fn) from bridge. Each event invokes its ordinary subscribers first, then all-event subscribers with (event, value). Use snapshots so listeners added during an emit wait for a later emit. All-event subscriptions use independent idempotent unsubscription, even for the same fn. Ordinary event names including * remain literal. Return the total number invoked; preserve synchronous exception propagation.',
});
family('http', {
  'README.md': 'Transport is injected as async transport({method,url,headers,body,signal}). It returns {status,body}. Client.get reads JSON bodies already decoded by transport. No external network is needed.\n',
  'src/request.mjs': `export async function request(transport, url, options={}) {
  const response=await transport({method:options.method||'GET',url,headers:options.headers||{},body:options.body,signal:options.signal});
  if(response.status>=400) throw Object.assign(new Error('HTTP '+response.status),{status:response.status});
  return response.body;
}
`,
  'src/client.mjs': `import { request } from './request.mjs';
export class Client {
 constructor(transport, base='') { this.transport=transport; this.base=base; }
 get(path, options={}) { return request(this.transport,this.base+path,{headers:options.headers}); }
}
export { request } from './request.mjs';
`,
  'test/public.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import { Client, request } from '../src/client.mjs';
test('GET and HTTP error',async()=>{ const seen=[]; const c=new Client(async r=>{seen.push(r);return {status:200,body:{ok:true}};},'/api'); assert.deepEqual(await c.get('/x'),{ok:true}); assert.equal(seen[0].url,'/api/x'); await assert.rejects(request(async()=>({status:404}),'/x'),{status:404}); });
`,
}, {
  retry: 'Add options.retries, a nonnegative integer defaulting to zero, to request and Client.get. Retry only GET responses with status 502, 503 or 504; retries counts additional attempts. Preserve headers and signal on every attempt without mutating options. Do not retry transport rejections, other statuses or non-GET methods. Invalid retries throws TypeError before transport. Return the last HTTP error status when exhausted. Forward all documented request options from Client.get.',
  abort: 'Forward Client.get options.signal to request. An already-aborted signal prevents transport and rejects with signal.reason (including non-Error reasons). If the signal aborts while transport is pending, reject promptly with its reason even when transport ignores cancellation. Clean up listeners after success, transport rejection or abort. A late transport rejection must not cause an unhandled rejection. Preserve existing HTTP error behavior.',
  headers: 'Add a third Client constructor argument defaultHeaders. Client.get merges defaults and per-call headers case-insensitively; per-call wins, including empty string values. request should forward a fresh header object without mutating any input, so transport mutation cannot affect later calls. Keep base URL behavior and existing exports. Add Client.post(path, body, options) with the same merge behavior, POST method, body and signal forwarded. Preserve GET method for get regardless of an options.method field.',
});
family('pages', {
  'README.md': 'Page source is injected as async fetchPage(cursor), returning {items,next}. null ends iteration. Item IDs are strings. Existing collect returns an array in source order.\n',
  'src/pages.mjs': `export async function collect(fetchPage) {
 const result=[]; let cursor=null;
 do { const page=await fetchPage(cursor); result.push(...page.items); cursor=page.next; } while(cursor!==null);
 return result;
}
`,
  'src/report.mjs': `import { collect } from './pages.mjs';
export async function report(fetchPage) { const items=await collect(fetchPage); return {count:items.length,items}; }
export { collect } from './pages.mjs';
`,
  'test/public.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import { report } from '../src/report.mjs';
test('two pages',async()=>{ const r=await report(async cursor=>cursor===null?{items:[{id:'a'}],next:'two'}:{items:[{id:'b'}],next:null}); assert.equal(r.count,2); assert.deepEqual(r.items.map(x=>x.id),['a','b']); });
`,
}, {
  cycles: 'Detect repeated non-null pagination cursors in collect and reject with an Error whose code is PAGINATION_CYCLE before fetching a cursor twice. Empty-string cursors are valid; null alone terminates. Continue across empty pages. report must propagate the same error unchanged. Validate each page contains an items array and next is string or null, rejecting malformed pages with TypeError instead of looping. Preserve item order.',
  stream: 'Export an async generator iterate(fetchPage) from pages and report modules, and implement collect using it. Fetch pages lazily, only when iteration requires an item; stopping after one item must not fetch the following page. Empty pages may be skipped, null terminates, and empty string is a valid cursor. Add report(fetchPage,{limit}) where limit is an optional nonnegative integer; stop after that many items without fetching further pages, with limit zero making no source calls. Keep unbounded report behavior and propagate source errors.',
  unique: 'Add collect(fetchPage,{uniqueBy}) where uniqueBy is an optional function. Keep the first item for each key using SameValueZero key equality, preserving source order across pages. Falsy keys including undefined are legitimate keys. Without uniqueBy, preserve duplicates. Forward this option through report so count reflects retained items. Reject a supplied non-function uniqueBy with TypeError before fetching any page; do not mutate returned page arrays.',
});
family('batch', {
  'README.md': 'Batch processing uses injected async workers. Output corresponds to input positions. runJobs supplies job.payload to workers. Public functions return promises.\n',
  'src/batch.mjs': `export async function mapBatch(items, worker) { const result=[]; for(let i=0;i<items.length;i++) result.push(await worker(items[i],i)); return result; }
`,
  'src/jobs.mjs': `import { mapBatch } from './batch.mjs';
export function runJobs(jobs, worker) { return mapBatch(jobs,job=>worker(job.payload)); }
export { mapBatch } from './batch.mjs';
`,
  'test/public.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import { runJobs, mapBatch } from '../src/jobs.mjs';
test('legacy serial results',async()=>{assert.deepEqual(await runJobs([{payload:2},{payload:4}],async n=>n*2),[4,8]);assert.deepEqual(await mapBatch([],async()=>1),[]);});
`,
}, {
  concurrency: 'Add options.concurrency to mapBatch and runJobs, default one. It must be a positive integer; reject invalid values before workers run. Run up to that many workers concurrently while preserving result order and original indexes passed to mapBatch workers. Upon first worker rejection, stop scheduling new items, wait for already-running workers to settle, then reject with the first observed reason. Never produce unhandled rejections or mutate inputs.',
  settled: 'Add options.settled to mapBatch and runJobs. With settled:true, process every item and return ordered {status:"fulfilled",value} or {status:"rejected",reason} records, including non-Error rejection reasons and synchronous worker throws. With the option absent or false preserve fail-fast legacy behavior and raw values. Empty inputs return an empty array. Forward the original index as the second argument to the runJobs worker without changing its payload first argument.',
  cancel: 'Add options.signal to mapBatch and runJobs. Check abort before starting and before each next worker. Already-aborted signals invoke no worker. On abort, do not schedule more work; let the current worker settle, then reject with signal.reason even if it fulfilled. Preserve non-Error reasons and normal worker rejection when no abort occurred. Workers receive the signal as their third argument, including through the runJobs adapter (payload,index,signal). Preserve serial order and unchanged legacy calls.',
});
family('records', {
  'README.md': 'RecordStore stores JSON-compatible objects keyed by string. get returns undefined for missing IDs. API adapter exposes put/get. Do not require a particular internal data structure.\n',
  'src/store.mjs': `export class RecordStore {
 constructor() { this.records={}; }
 put(id, value) { this.records[id]=value; return value; }
 get(id) { return this.records[id]; }
 remove(id) { const exists=Object.hasOwn(this.records,id); delete this.records[id]; return exists; }
}
`,
  'src/api.mjs': `export function createApi(store) { return {put:(id,value)=>store.put(id,value), get:id=>store.get(id)}; }
export { RecordStore } from './store.mjs';
`,
  'test/public.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import { RecordStore,createApi } from '../src/api.mjs';
test('basic records',()=>{const s=new RecordStore(),api=createApi(s);api.put('a',{n:1});assert.deepEqual(api.get('a'),{n:1});assert.equal(s.remove('a'),true);assert.equal(s.remove('a'),false);});
`,
}, {
  isolation: 'RecordStore must accept all string IDs, including __proto__, constructor and toString, without inherited entries or prototype changes. Clone JSON-compatible values on put and get, and also the value returned by put, so callers cannot mutate stored nested state. Preserve missing undefined and remove booleans. API behavior must inherit these guarantees; add remove to createApi. Reject non-string IDs with TypeError consistently before any state mutation.',
  update: 'Add RecordStore.update(id, updater) and expose it in createApi. Missing IDs throw an Error with code NOT_FOUND. Pass an isolated copy of the stored value to the synchronous updater; on throw, preserve previous data and rethrow the same reason. On success store and return isolated copies of the updater result, so retained references cannot mutate store data. Existing put/get must also isolate nested data. Support all string IDs without inherited-property collisions.',
  rename: 'Add RecordStore.rename(oldId,newId) and expose it in createApi. Move the existing value without changing it. Missing old ID throws code NOT_FOUND; an already occupied different new ID throws code CONFLICT; errors leave all entries intact. Renaming an existing ID to itself succeeds as a no-op. Return the moved value. Treat all string IDs including __proto__ literally and reject non-string IDs with TypeError. Preserve put/get/remove exports and behavior for ordinary IDs.',
});
family('settings', {
  'README.md': 'Settings resolves application options without environment or filesystem reads. createService consumes resolve. Old defaults are enabled:true, timeoutMs:1000, tags:[]. Inputs must never be mutated.\n',
  'src/settings.mjs': `export function resolve(input={}) { return {enabled:input.enabled??true,timeoutMs:input.timeoutMs??1000,tags:input.tags??[]}; }
`,
  'src/service.mjs': `import { resolve } from './settings.mjs';
export function createService(input, transport) { const options=resolve(input); return {options,send:value=>options.enabled?transport(value,{timeoutMs:options.timeoutMs}):Promise.resolve(null)}; }
export { resolve } from './settings.mjs';
`,
  'test/public.test.mjs': `import test from 'node:test'; import assert from 'node:assert/strict'; import { createService,resolve } from '../src/service.mjs';
test('defaults and disabled',async()=>{assert.deepEqual(resolve(),{enabled:true,timeoutMs:1000,tags:[]});const s=createService({enabled:false},()=>{throw Error('called');});assert.equal(await s.send('x'),null);});
`,
}, {
  validation: 'Validate resolve inputs: input must be a non-null non-array object when supplied; enabled, if present, must be boolean; timeoutMs, if present, must be a finite nonnegative integer; tags, if present, must be an array of strings. Explicit null is invalid, while an omitted property gets the existing default. Preserve empty arrays, false and zero. Clone tags so input mutation cannot alter resolved settings. createService must use the same validation before invoking transport.',
  layering: 'Add resolve(input={}, defaults={}) with field-by-field precedence: own input properties override defaults, which override built-ins. Preserve explicit false, zero and empty tags. Arrays replace rather than concatenate. Clone tags so neither source is aliased. Add a third createService argument defaults and use the layered resolution for both exposed options and transport timeout. Reject null values rather than treating them as absent. Preserve unknown-field ignoring and legacy calls.',
  snapshot: 'Make createService take a settings snapshot: later mutations to input, nested tags or the exposed service.options must not affect subsequent sends. Forward tags to transport alongside timeoutMs as a fresh array per call, so a transport that mutates it cannot affect another send. Keep exposed options available and independent. Disabled service still returns null without transport. resolve itself must return independent tags; preserve defaults and existing exports.',
});
