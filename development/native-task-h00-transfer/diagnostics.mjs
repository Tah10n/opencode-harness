// Model-free post-outcome diagnostics. Emit source only; never submit provider calls.
// Run only in a disposable ordinary copy with the selected author's patch applied.
import {script} from './evaluation-cases.mjs';
const mutations={
 'denque-rotate': `\n;(function () {\n  var original = Denque.prototype.rotate;\n  Denque.prototype.rotate = function (steps) {\n    var result = original.apply(this, arguments);\n    var n = this.length, count = steps === undefined ? 1 : steps;\n    if (n > 1 && count % n !== 0) {\n      for (var i = 0; i < n; i++) {\n        var slot = (this._head + i) & this._capacityMask;\n        var value = this._list[slot];\n        if (value && typeof value === 'object') this._list[slot] = Array.isArray(value) ? value.slice() : Object.assign({}, value);\n      }\n    }\n    return result;\n  };\n}());\n`,
 'denque-remove-where': `\n;(function () {\n  var original = Denque.prototype.removeWhere;\n  Denque.prototype.removeWhere = function () {\n    var removed = original.apply(this, arguments);\n    if (removed > 0) this._capacity = undefined;\n    return removed;\n  };\n}());\n`
};
const idleProbe=`const A=require('node:assert/strict'),api=require('./queue.js');
const guard=setTimeout(()=>{console.error('Unresolved idle subscription');process.exitCode=1;},8000);
(async()=>{let finish;const q=api((v,cb)=>{finish=cb;},1);q.pause();q.push('discarded');let settled=false;const old=q.onIdle().then(()=>{settled=true;});q.kill();A.equal(q.idle(),true);q.resume();q.push('later independent work');await new Promise(setImmediate);const observed=settled;A.equal(q.running(),1);finish(null);await old;console.log(JSON.stringify({idleTransitionObserved:true,oldSubscriptionResolvedBeforeLaterWorkFinished:observed}));A.equal(observed,true,'The subscription must observe the already-reached idle state, not wait for later independent work');})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(guard));`;
const earlyKillMutation=`
;(function () {
 const originalFactory=module.exports;
 function wrap(queue){
  const originalIdle=queue.onIdle,observers=[];
  queue.onIdle=function(){return new Promise(resolve=>{observers.push(resolve);originalIdle.call(queue).then(resolve);});};
  for(const method of ['kill','killAndDrain']){const original=queue[method];queue[method]=function(){const result=original.apply(this,arguments);if(queue.running()>0){for(const resolve of observers)resolve();observers.length=0;}return result;};}
  return queue;
 }
 function diagnosticFactory(){return wrap(originalFactory.apply(this,arguments));}
 Object.assign(diagnosticFactory,originalFactory);
 diagnosticFactory.promise=function(){return wrap(originalFactory.promise.apply(this,arguments));};
 module.exports=diagnosticFactory;
}());
`;

export function diagnostic(task, mode, project) {
  if (mode === 'original') return script(task, project);
  if (mode === 'denque-sensitivity' && mutations[task]) return mutations[task];
  if (task === 'fastq-on-idle' && mode === 'idle-transition') return idleProbe;
  if (task === 'fastq-on-idle' && mode === 'early-kill-sensitivity') return earlyKillMutation;
  if (task === 'quick-lru-prune' && mode === 'callback-order-interpretation') {
    const body = script(task, project);
    const before = "A.deepEqual(ev,[['old-expired',1],['current-expired',undefined]])";
    if (body.split(before).length !== 2) throw new Error('Expected frozen assertion missing');
    return body.replace(before, "A.deepEqual(ev.slice().sort((a,b)=>a[0]<b[0]?-1:1),[['current-expired',undefined],['old-expired',1]])");
  }
  throw new Error('Unknown diagnostic');
}
if (process.argv[1]?.endsWith('/diagnostics.mjs')) {
  const [task, mode, project] = process.argv.slice(2);
  process.stdout.write(diagnostic(task, mode, project));
}
