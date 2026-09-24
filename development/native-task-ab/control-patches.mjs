// Local rubric calibration only. These bytes must never reach executing Luna.
import fs from 'node:fs';
import path from 'node:path';

export function controlFiles(task, source, variant='reference') {
  const files={},read=name=>fs.readFileSync(path.join(source,name),'utf8');
  const alternate=variant==='alternative';
  if(task==='limit-function-controls'){
    let code=read('index.js');
    const insert=alternate
      ? `\n\tfor (const name of ['activeCount', 'pendingCount', 'concurrency']) {\n\t\tObject.defineProperty(limitedFunction, name, Object.getOwnPropertyDescriptor(limit, name));\n\t}\n`
      : `\n\tObject.defineProperties(limitedFunction, {\n\t\tactiveCount: {get: () => limit.activeCount},\n\t\tpendingCount: {get: () => limit.pendingCount},\n\t\tconcurrency: {get: () => limit.concurrency, set: value => { limit.concurrency = value; }},\n\t});\n`;
    code=code.replace('\n\treturn limitedFunction;',insert+'\n\treturn limitedFunction;');
    if(variant==='wrong-snapshot')code=read('index.js').replace('\n\treturn limitedFunction;',"\n\tObject.assign(limitedFunction, {activeCount: limit.activeCount, pendingCount: limit.pendingCount, concurrency: limit.concurrency});\n\treturn limitedFunction;");
    files['index.js']=code;files['index.d.ts']=read('index.d.ts').replace("Pick<LimitFunction, 'clearQueue'>","Pick<LimitFunction, 'clearQueue' | 'activeCount' | 'pendingCount' | 'concurrency'>");
  } else if(task==='clear-queue-reason'){
    let code=read('index.js').replace('value() {','value(reason'+(alternate?' = AbortSignal.abort().reason':'')+') {');
    code=code.replace('const abortError = AbortSignal.abort().reason;', 'const abortError = '+(alternate?'reason':'reason === undefined ? AbortSignal.abort().reason : reason')+';');
    if(variant==='wrong-falsy')code=code.replace('reason === undefined ? AbortSignal.abort().reason : reason','reason || AbortSignal.abort().reason');
    if(variant==='wrong-disabled')code=code.replace('if (!rejectOnClear) {','if (!rejectOnClear && reason === undefined) {');
    files['index.js']=code;files['index.d.ts']=read('index.d.ts').replace('clearQueue: () => void','clearQueue: (reason?: unknown) => void');
  } else if(task==='bind-methods-atomic'){
    let code=read('index.js');const start=code.indexOf('\n\tbindMethods(target, methodNames) {');
    let section=code.slice(start);
    section=section.replace('methodNames = defaultMethodNamesOrAssert(methodNames);','methodNames = [...new Set(defaultMethodNamesOrAssert(methodNames))];');
    const preflight=`\n\t\tfor (const methodName of methodNames) {\n\t\t\tconst descriptor = Object.getOwnPropertyDescriptor(target, methodName);\n\t\t\tif (target[methodName] !== undefined || (descriptor && !descriptor.configurable) || (!descriptor && !Object.isExtensible(target))) {\n\t\t\t\tthrow new ${alternate?'TypeError':'Error'}('Target cannot bind ' + methodName);\n\t\t\t}\n\t\t}\n`;
    section=section.replace('\n\t\tfor (const methodName of methodNames) {',preflight+'\n\t\tfor (const methodName of methodNames) {');
    code=code.slice(0,start)+section;
    if(variant==='wrong-partial')code=read('index.js').replace('methodNames = defaultMethodNamesOrAssert(methodNames);','methodNames = [...new Set(defaultMethodNamesOrAssert(methodNames))];');
    files['index.js']=code;
  } else if(task==='listener-count-deduplicate'){
    let code=read('index.js');const start=code.indexOf('\n\tlistenerCount(eventNames) {'),end=code.indexOf('\n\tbindMethods(',start);
    let section=code.slice(start,end);
    section=alternate?section.replace('eventNames = Array.isArray(eventNames) ? eventNames : [eventNames];','eventNames = [...new Set(Array.isArray(eventNames) ? eventNames : [eventNames])];'):section.replace('for (const eventName of eventNames)','for (const eventName of new Set(eventNames))');
    if(variant==='wrong-symbol-string')section=section.replace('new Set(eventNames)','new Set(eventNames.map(String))');
    files['index.js']=code.slice(0,start)+section+code.slice(end);
  } else if(task==='clear-queue-count'){
    let code=read('source/index.ts');const start=code.indexOf('\n\tclear(): void {'),end=code.indexOf('\n\t/**',start+1);
    let section=code.slice(start,end).replace('clear(): void {',`clear(): number {\n\t\tconst discarded = ${alternate?'this.size':'this.#queue.size'};`);
    section=section.replace("\n\t\tthis.emit('next');\n\t}","\n\t\tthis.emit('next');\n\t\treturn discarded;\n\t}");
    if(variant==='wrong-includes-active')section=section.replace('const discarded = this.#queue.size;','const discarded = this.#queue.size + this.#pending;');
    if(variant==='wrong-after-clear')section=section.replace('return discarded;','return this.#queue.size;');
    files['source/index.ts']=code.slice(0,start)+section+code.slice(end);
  } else if(task==='abortable-queue-waiters'){
    let code=read('source/index.ts');
    for(const [method,event] of [['onEmpty','empty'],['onIdle','idle'],['onPendingZero','pendingZero']]){
      code=code.replace(`async ${method}(): Promise<void> {`,`async ${method}({signal}: {signal?: AbortSignal} = {}): Promise<void> {\n\t\tsignal?.throwIfAborted();`);
      code=code.replace(`await this.#onEvent('${event}');`,`await this.#onEvent('${event}', undefined, signal);`);
    }
    code=code.replace('async #onEvent(events: EventName | EventName[], filter?: () => boolean): Promise<void> {','async #onEvent(events: EventName | EventName[], filter?: () => boolean, signal?: AbortSignal): Promise<void> {');
    const start=code.indexOf('\n\tasync #onEvent('),end=code.indexOf('\n\t/**',start+1);
    let section=code.slice(start,end).replace('return new Promise(resolve => {','return new Promise((resolve, reject) => {');
    section=section.replace('\n\t\t\tconst listener = () => {',`\n\t\t\tconst cleanup = () => {\n\t\t\t\tfor (const event of eventList) {\n\t\t\t\t\tthis.off(event, listener);\n\t\t\t\t}\n\t\t\t\tsignal?.removeEventListener('abort', onAbort);\n\t\t\t};\n\t\t\tconst onAbort = () => {\n\t\t\t\tcleanup();\n\t\t\t\treject(signal?.reason);\n\t\t\t};\n\t\t\tconst listener = () => {`);
    const old="\n\t\t\t\tfor (const event of eventList) {\n\t\t\t\t\tthis.off(event, listener);\n\t\t\t\t}\n\n\t\t\t\tresolve();";
    section=section.replace(old,'\n\t\t\t\tcleanup();\n\t\t\t\tresolve();');
    section=section.replace('\n\t\t\tfor (const event of eventList) {',"\n\t\t\tif (signal?.aborted) {\n\t\t\t\tonAbort();\n\t\t\t\treturn;\n\t\t\t}\n\t\t\tsignal?.addEventListener('abort', onAbort, {once: true});\n\t\t\tfor (const event of eventList) {");
    if(alternate)section=section.replace("signal?.addEventListener('abort', onAbort, {once: true});","signal?.addEventListener('abort', onAbort);");
    code=code.slice(0,start)+section+code.slice(end);
    if(variant==='wrong-initial')code=code.replaceAll('\n\t\tsignal?.throwIfAborted();','');
    if(variant==='wrong-leaks')code=code.replace("signal?.removeEventListener('abort', onAbort);",'// intentionally missing cleanup');
    files['source/index.ts']=code;
  } else throw Error('Unknown task');
  if(variant==='unchanged')return {};
  return files;
}
