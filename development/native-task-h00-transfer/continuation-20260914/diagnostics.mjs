// Supplemental checks of existing task contracts, identified after execution began.
// Emits source only. Use independent ordinary copies; never repair author patches.
import {script} from '../evaluation-cases.mjs';

export function diagnostic(task, mode, variant) {
  if (task === 'ufo-append-query' && mode === 'empty-value-interpretation') {
    const body = script(task, 'ufo');
    const before = "A.equal(api.appendQuery('/p?x=1',{x:null}),'/p?x=1&x=')";
    const after = "A.ok(['/p?x=1&x=','/p?x=1&x'].includes(api.appendQuery('/p?x=1',{x:null})))";
    if (body.split(before).length !== 2) throw new Error('Exact frozen assertion missing');
    return body.replace(before, after);
  }
  if (task === 'ms-parse-compound' && mode === 'trailing-whitespace-contract') {
    return `const A=require('node:assert/strict');(async()=>{const api=await import('./dist/index.js');const rows=[10,13,0x2028,0x2029].map(code=>{const input='1h 30m'+String.fromCharCode(code),value=api.parseCompound(input);return {code,input,actual:Number.isNaN(value)?'NaN':value,pass:Number.isNaN(value)};});console.log(JSON.stringify(rows));A.ok(rows.every(row=>row.pass),'Every trailing whitespace input must return NaN');})().catch(error=>{console.error(error);process.exitCode=1;});`;
  }
  if (task === 'quick-lru-computed' && mode === 'missing-default-ttl-sensitivity') {
    return `
;{const original=QuickLRU.prototype.getOrInsertComputed;QuickLRU.prototype.getOrInsertComputed=function(key,factory){let computed=false;const value=original.call(this,key,(...args)=>{computed=true;return factory(...args);});if(computed)this.set(key,value,{maxAge:Number.POSITIVE_INFINITY});return value;};}
`;
  }
  if (task === 'quick-lru-computed' && mode === 'isolated-default-ttl-sensitivity') {
    return `const fs=require('node:fs');let source=fs.readFileSync('index.js','utf8');const anchor='\\n\\t// For tests.';if(source.split(anchor).length!==2)throw Error('Pinned class insertion anchor missing');source=source.replace(anchor,'\\n\\t__diagnosticDropComputedExpiry(key) { const entry=this.#cache.get(key) ?? this.#oldCache.get(key); if(entry)entry.expiry=undefined; }'+anchor);source+='\\n;{const original=QuickLRU.prototype.getOrInsertComputed;QuickLRU.prototype.getOrInsertComputed=function(key,factory){let computed=false;const value=original.call(this,key,(...args)=>{computed=true;return factory(...args);});if(computed)this.__diagnosticDropComputedExpiry(key);return value;};}\\n';fs.writeFileSync('index.js',source);`;
  }
  if (task === 'ufo-append-query' && mode === 'empty-array-test-sensitivity') {
    return `const fs=require('node:fs');const file='src/utils.ts';let source=fs.readFileSync(file,'utf8');const anchor='export function appendQuery(input: string, query: QueryObject): string {';if(source.split(anchor).length!==2)throw Error('Public appendQuery signature missing');const mutation=\`\n  const diagnosticParsed = parseURL(input);\n  const diagnosticQuery = parseQuery(diagnosticParsed.search);\n  let diagnosticChanged = false;\n  for (const key of Object.keys(query)) {\n    if (Array.isArray(query[key]) && query[key].length === 0 && Object.prototype.hasOwnProperty.call(diagnosticQuery, key)) { delete diagnosticQuery[key]; diagnosticChanged = true; }\n  }\n  if (diagnosticChanged) { diagnosticParsed.search = stringifyQuery(diagnosticQuery); input = stringifyParsedURL(diagnosticParsed); }\n\`;fs.writeFileSync(file,source.replace(anchor,anchor+mutation));`;
  }
  if (task === 'fastq-on-idle' && mode === 'subscription-inside-drain') {
    return `const A=require('node:assert/strict'),api=require('./queue.js');const guard=setTimeout(()=>{console.error('Unresolved drain subscription');process.exitCode=1;},8000);(async()=>{let firstFinish,secondFinish,inside,settled=false,drains=0;const q=api((value,cb)=>{if(value===1)firstFinish=cb;else secondFinish=cb;},1);q.drain=()=>{if(++drains===1){inside=q.onIdle().then(()=>{settled=true;});q.push(2);}};q.push(1);firstFinish(null);await new Promise(setImmediate);const observed=settled;A.equal(q.running(),1);secondFinish(null);await inside;console.log(JSON.stringify({subscriptionCreatedInsideDrain:true,settledBeforeReentrantWorkerFinished:observed}));A.equal(observed,false,'A subscription inside drain must wait until synchronous callbacks and their reentrant work leave the queue idle');})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(guard));`;
  }
  if (task === 'eventemitter-remove-context' && mode === 'normalized-context-types') {
    return `import EventEmitter from './index';
interface Events { data: [value: string] }
interface Context { name: string }
const emitter = new EventEmitter<Events, Context>();
emitter.on('data', value => { value.toUpperCase(); });
const removed: number = emitter.removeListenersByContext(emitter);
void removed;
`;
  }
  if (task === 'denque-rotate' && mode === 'readme-example-claim') {
    if (variant === 'after-pop') {
      return `const A=require('node:assert/strict'),Denque=require('./index.js');const q=new Denque([1,2,3,4]);q.shift();q.pop();q.rotate();console.log(JSON.stringify({actual:q.toArray(),readmeClaim:'moves 4 to the front'}));A.equal(q.peekFront(),4,'README claims rotate moves 4 after the preceding pop');`;
    }
    if (variant === 'two-rotations') {
      return `const A=require('node:assert/strict'),Denque=require('./index.js');const q=new Denque([1,2,3,4]);q.rotate();q.rotate(-2);console.log(JSON.stringify({actual:q.toArray(),readmeClaim:[1,2,3,4]}));A.deepEqual(q.toArray(),[1,2,3,4],'README claims this result after the sequential rotations');`;
    }
  }
  throw new Error('Unknown supplemental diagnostic');
}
if (process.argv[1]?.endsWith('/continuation-20260914/diagnostics.mjs')) {
  const [task, mode, variant] = process.argv.slice(2);
  process.stdout.write(diagnostic(task, mode, variant));
}
