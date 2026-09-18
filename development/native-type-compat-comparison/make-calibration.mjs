import fs from 'node:fs';import path from 'node:path';
const root=path.resolve('local/native-type-compat-comparison/batch'),dev=path.resolve('development/native-type-compat-comparison');
for(const task of (process.env.CALIBRATION_TASKS??'A,B').split(','))for(const label of ['reference','alternative','missing','erased-types','legacy-break','runtime-break']){
 const d=root+(task==='B'?'/waitfor-calibration/':'/calibration/')+task+'/'+label;fs.cpSync(root+'/inputs/'+task,d,{recursive:true,verbatimSymlinks:true});
 let code=fs.readFileSync(d+'/index.js','utf8'),types=fs.readFileSync(d+'/index.d.ts','utf8');
 const signature=method=>task==='B'?`  waitFor<T extends EventEmitter.EventNames<EventTypes>>(event: T, options?: {signal?: AbortSignal}): Promise<EventEmitter.EventArgs<EventTypes, T>>;\n`:`  ${method}<T extends EventEmitter.EventNames<EventTypes>>(event: T, fn: (this: Context, ...args: EventEmitter.EventArgs<EventTypes, T>) => void, context?: Context): ${task==='A'?'() => void':'this'};\n`;
 const methods=task==='A'?['subscribe']:['waitFor'];
 if(task==='A')code=code.replace('EventEmitter.prototype.eventNames =',`EventEmitter.prototype.subscribe = function(event, fn, context) {
  addListener(this, event, fn, context, false);
  var emitter = this, evt = prefix ? prefix + event : event;
  var current = this._events[evt], registration = current.fn ? current : current[current.length - 1];
  var cancelled = false;
  return function unsubscribe() {
    if (cancelled) return; cancelled = true;
    var listeners = emitter._events[evt];
    if (!listeners) return;
    if (listeners === registration) { clearEvent(emitter, evt); return; }
    if (listeners.fn) return;
    ${label==='alternative'?`var retained = listeners.slice(), at = retained.indexOf(registration); if (at < 0) return; retained.splice(at, 1);`:`var retained = []; for(var i=0;i<listeners.length;i++) if(listeners[i] !== registration) retained.push(listeners[i]);`}
    if (!retained.length) clearEvent(emitter, evt);
    else emitter._events[evt] = retained.length === 1 ? retained[0] : retained;
  };
};
EventEmitter.prototype.eventNames =`);
 else {
 code=code.replace('EventEmitter.prototype.eventNames =',`EventEmitter.prototype.waitFor=function(event,options){
  var emitter=this,signal=options && options.signal;
  return new Promise(function(resolve,reject){
    if(signal && signal.aborted){reject(signal.reason);return;}
    var settled=false;
    function cleanup(){emitter.removeListener(event,listener);if(signal)signal.removeEventListener('abort',abort);}
    function abort(){if(settled)return;settled=true;cleanup();reject(signal.reason);}
    function listener(){if(settled)return;settled=true;cleanup();resolve(${label==='alternative'?'Array.from(arguments)':'Array.prototype.slice.call(arguments)'});}
    emitter.on(event,listener);
    if(signal)signal.addEventListener('abort',abort);
  });
};
EventEmitter.prototype.eventNames =`);
 }

 types=types.replace('  static prefixed:',methods.map(signature).join('')+'  static prefixed:');
 if(label==='alternative')types=types.replaceAll('(this: Context, ...args: EventEmitter.EventArgs<EventTypes, T>) => void','Contextual<Context, EventEmitter.EventArgs<EventTypes, T>>')+'\ntype Contextual<C, A extends any[]> = (this: C, ...args: A) => void;\n';
 if(label==='missing'){code=fs.readFileSync(d+'/index.js','utf8');types=fs.readFileSync(d+'/index.d.ts','utf8');}
 if(label==='erased-types')for(const method of methods)types=types.replace(signature(method),task==='B'?`  ${method}(...args: any[]): any;\n`:`  ${method}(event: any, fn: (...args: any[]) => void, context?: any): any;\n`);
 if(label==='legacy-break')types=types.replace('Array<EventEmitter.EventListener<EventTypes, T>>','Array<(this: Context, ...args: EventEmitter.EventArgs<EventTypes, T>) => void>');
 if(label==='runtime-break')code=task==='A'?code.replace('    var listeners = emitter._events[evt];','    emitter.removeListener(event,fn,context); return;\n    var listeners = emitter._events[evt];'):code.replace('cleanup();reject(signal.reason);','reject(signal.reason);');
 fs.writeFileSync(d+'/index.js',code);fs.writeFileSync(d+'/index.d.ts',types);
 const check=fs.readFileSync(dev+'/evaluation/'+task+'.cjs','utf8');const fun=check.slice(check.indexOf(task==='A'?'function check(':'async function check('),check.indexOf(task==='A'?'\ncheck(':'\nconst watchdog'));
 fs.appendFileSync(d+'/test/test.js',`\ndescribe('new public API', function(){it('implements lifecycle and compatibility',async function(){const assert=require('node:assert/strict');\n${fun}\nawait check(require('../'));});});\n`);
 fs.appendFileSync(d+'/test/test.mjs',`\nimport assertAdded from 'node:assert/strict';\nimport AddedEmitter from '../index.mjs';\nit('implements added API through ESM',async function(){const assert=assertAdded;\n${fun}\nawait check(AddedEmitter);});\n`);
 fs.copyFileSync(dev+'/evaluation/'+task+'.types.ts',d+'/api.types.ts');
 fs.appendFileSync(d+'/README.md',task==='A'?'\n### subscribe(event, fn, context?)\nReturns an idempotent unsubscribe function for exactly one persistent registration. Unlike off it preserves other identical registrations; removal and later re-registration cannot revive cancellation. Current dispatch retains its captured listeners; future emits see cancellation. Context and arguments follow on.\n':'\n### waitFor(event, options?)\nReturns a Promise for a fresh next-event argument tuple. Register synchronously; independent waiters settle once. Optional signal rejects with its reason and removes just this waiter. Event or abort wins first, with abort handler cleanup. Ordinary off/removeAllListeners does not settle the promise; a later abort still rejects.\n');
}
console.log('Fresh evaluator solutions, alternative implementations and four controls per task prepared');
