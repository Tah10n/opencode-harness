import fs from 'node:fs';import path from 'node:path';
export function controlFiles(id,source,variant){
 if(variant==='unchanged')return {};
 let code=fs.readFileSync(path.join(source,'index.js'),'utf8'),types=fs.readFileSync(path.join(source,'index.d.ts'),'utf8');
 if(id==='promise-clear-queue'){
  const start=code.indexOf('pDebounce.promise =');let section=code.slice(start).replace('return async function (...arguments_) {','const debounced = async function (...arguments_) {');
  const method=variant==='alternative'?`\n\tdebounced.clearQueue = reason => {\n\t\tconst call = queuedCall;\n\t\tqueuedCall = undefined;\n\t\tif (!call) return 0;\n\t\tconst error = reason === undefined ? Object.assign(new Error('Queued call discarded'), {name: 'AbortError'}) : reason;\n\t\tcall.resolvers.forEach(({reject}) => reject(error));\n\t\treturn call.resolvers.length;\n\t};\n\treturn debounced;\n`:`\n\tdebounced.clearQueue = reason => {\n\t\tif (!queuedCall) return 0;\n\t\tconst call = queuedCall;\n\t\tqueuedCall = undefined;\n\t\tconst error = reason === undefined ? new DOMException('Queued call discarded', 'AbortError') : reason;\n\t\tfor (const {reject} of call.resolvers) reject(error);\n\t\treturn call.resolvers.length;\n\t};\n\treturn debounced;\n`;
  const at=section.lastIndexOf('\n};');section=section.slice(0,at)+method+section.slice(at);code=code.slice(0,start)+section;
  const atType=types.indexOf('\n\tpromise<');types=types.slice(0,atType)+types.slice(atType).replace('): (this: This, ...arguments: ArgumentsType) => Promise<ReturnType>;',' ): ((this: This, ...arguments: ArgumentsType) => Promise<ReturnType>) & {clearQueue(reason?: unknown): number};');
  if(variant==='wrong-falsy')code=code.replace('reason === undefined','!reason');
  if(variant==='wrong-count')code=code.replace('return call.resolvers.length;','return 1;');
  if(variant==='wrong-still-runs')code=code.replace('const call = queuedCall;\n\t\tqueuedCall = undefined;','const call = queuedCall;');
  if(variant==='wrong-active-reset')code=code.replace('debounced.clearQueue = reason => {','debounced.clearQueue = reason => {\n\t\tcurrentPromise = undefined;');
 }else{
  code=code.replace('weight(...arguments_)',variant==='alternative'?'Reflect.apply(weight, this, arguments_)':'weight.apply(this, arguments_)').replace('onDelay?.(...arguments_)',variant==='alternative'?'if (onDelay) { Reflect.apply(onDelay, this, arguments_); }':'onDelay?.apply(this, arguments_)');
  if(variant==='wrong-weight')code=code.replace('weight.apply(this, arguments_)','weight(...arguments_)');
  if(variant==='wrong-delay')code=code.replace('onDelay?.apply(this, arguments_)','onDelay?.(...arguments_)');
  if(variant==='wrong-options')code=code.replace('weight.apply(this, arguments_)','weight.apply({limit}, arguments_)');
 }
 return {'index.js':code,'index.d.ts':types};
}
