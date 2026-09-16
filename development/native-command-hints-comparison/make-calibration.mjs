import fs from 'node:fs';import path from 'node:path';
const root=path.resolve('local/native-command-hints-comparison/batch');
for(const task of ['A','B']){const d=root+'/calibration/'+task+'/reference';fs.mkdirSync(path.dirname(d),{recursive:true});fs.cpSync(root+'/inputs/'+task,d,{recursive:true,verbatimSymlinks:true});
 if(task==='A'){
 const file=d+'/src/utils.ts';let code=fs.readFileSync(file,'utf8').replace('  decodePath,','  decodePath,\n  decodeQueryKey,');code+=`\n/** Remove all or selected decoded query keys without rewriting retained fields. */
export function withoutQuery(input: string, keys?: string | readonly string[]): string {
  const hash = input.indexOf("#");
  const end = hash === -1 ? input.length : hash;
  const query = input.indexOf("?");
  if (query === -1 || query >= end) return input;
  const prefix = input.slice(0, query);
  const fragment = input.slice(end);
  if (keys === undefined) return prefix + fragment;
  const selected = new Set(typeof keys === "string" ? [keys] : keys);
  const raw = input.slice(query + 1, end);
  let removed = false;
  const fields = raw.split("&").filter((field) => {
    const equals = field.indexOf("=");
    const key = decodeQueryKey(equals === -1 ? field : field.slice(0, equals));
    if (!selected.has(key)) return true;
    removed = true;
    return false;
  });
  if (!removed) return input;
  const retained = fields.join("&");
  return prefix + (retained ? "?" + retained : "") + fragment;
}\n`;fs.writeFileSync(file,code);fs.copyFileSync('development/native-command-hints-comparison/evaluation/A.test.ts',d+'/test/without-query.test.ts');fs.writeFileSync(d+'/test/without-query.test-d.ts',fs.readFileSync('development/native-command-hints-comparison/evaluation/A.types.ts','utf8').replace("'./dist/index'","'../src'"));fs.appendFileSync(d+'/README.md','\n### withoutQuery\n\n`withoutQuery(url)` removes the query, preserving the fragment.\n`withoutQuery(url, "token")` removes every decoded token key. Readonly key arrays are accepted.\nSurviving fields retain raw bytes and order, including empty ampersand-separated fields.\n');
 }else{
 const file=d+'/index.js';let code=fs.readFileSync(file,'utf8');const at=code.indexOf('EventEmitter.prototype.eventNames =');code=code.slice(0,at)+`EventEmitter.prototype.subscribe = function subscribe(event, fn, context) {
  addListener(this, event, fn, context, false);
  var emitter = this, evt = prefix ? prefix + event : event;
  var current = this._events[evt];
  var registration = current.fn ? current : current[current.length - 1];
  var cancelled = false;
  return function unsubscribe() {
    if (cancelled) return;
    cancelled = true;
    var listeners = emitter._events[evt];
    if (!listeners) return;
    if (listeners === registration) { clearEvent(emitter, evt); return; }
    if (listeners.fn) return;
    var retained = [];
    for (var i = 0; i < listeners.length; i++) if (listeners[i] !== registration) retained.push(listeners[i]);
    if (!retained.length) clearEvent(emitter, evt);
    else emitter._events[evt] = retained.length === 1 ? retained[0] : retained;
  };
};\n\n`+code.slice(at);fs.writeFileSync(file,code);
 const types=d+'/index.d.ts';fs.writeFileSync(types,fs.readFileSync(types,'utf8').replace('  addListener<T extends','  subscribe<T extends EventEmitter.EventNames<EventTypes>>(event: T, fn: EventEmitter.EventListener<EventTypes, T>, context?: Context): () => void;\n  addListener<T extends'));
 fs.appendFileSync(d+'/test/test.js',`\ndescribe('subscribe', function () {\n  it('cancels only its own duplicate registration', function () {\n    var assert = require('assert'), E = require('../'), e = new E(), n=0;\n    function fn(){n++;}\n    e.on('x',fn);var cancel=e.subscribe('x',fn);cancel();cancel();e.emit('x');assert.strictEqual(n,1);\n  });\n});\n`);
 fs.appendFileSync(d+'/test/test.mjs',`\nimport assertSubscription from 'node:assert/strict';\nimport SubscriptionEmitter from '../index.mjs';\nconst subscriptionEmitter = new SubscriptionEmitter();\nconst unsubscribe = subscriptionEmitter.subscribe('x', () => {});\nunsubscribe(); assertSubscription.equal(subscriptionEmitter.listenerCount('x'), 0);\n`);
 fs.copyFileSync('development/native-command-hints-comparison/evaluation/B.types.ts',d+'/subscription-types.ts');fs.appendFileSync(d+'/README.md','\n### subscribe(event, fn, context?)\n\nReturns an idempotent `unsubscribe(): void` for exactly this persistent registration.\nUnlike `off`, it preserves other registrations with identical callbacks/context.\nRemoving and re-registering does not let an old cancellation remove the new listener.\nCancellation affects subsequent emits; the current emit retains its existing snapshot.\n');
 }
 if(task==='B'){
  const x=fs.readFileSync('development/native-command-hints-comparison/evaluation/B.cjs','utf8'),fun=x.slice(x.indexOf('function check('),x.indexOf('\ncheck(E);'));
  fs.appendFileSync(d+'/test/test.js',"\ndescribe('subscription lifecycle contracts', function () { it('preserves the full public contract', function () {\nconst assert = require('node:assert/strict');\n"+fun+"\ncheck(require('../'));\n}); });\n");
  fs.appendFileSync(d+'/test/test.mjs',"\nit('preserves subscription lifecycle through ESM', () => {\n"+fun.replaceAll('assert.','assertSubscription.')+"\ncheck(SubscriptionEmitter);\n});\n");
 }
 const incomplete=root+'/calibration/'+task+'/incomplete';fs.cpSync(d,incomplete,{recursive:true,verbatimSymlinks:true});
 if(task==='A'){const p=incomplete+'/src/utils.ts';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('const key = decodeQueryKey(equals === -1 ? field : field.slice(0, equals));','const key = equals === -1 ? field : field.slice(0, equals);'));}
 else{const p=incomplete+'/index.js';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('    var listeners = emitter._events[evt];','    emitter.removeListener(event, fn, context); return;\n    var listeners = emitter._events[evt];'));}
}
console.log('Reference and substantive incomplete copies prepared outside author inputs');
