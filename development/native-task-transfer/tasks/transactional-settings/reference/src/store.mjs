import fs from 'node:fs';
export function read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
export class ConflictError extends Error{}
export function transact(file,fn,expectedRevision){const current=read(file);if(expectedRevision!==undefined&&expectedRevision!==current.revision)throw new ConflictError('Revision conflict');const draft=structuredClone(current.data);const result=fn(draft);if(result&&typeof result.then==='function')throw new TypeError('Synchronous callback required');const state={revision:current.revision+1,data:draft};const bytes=JSON.stringify(state);const tmp=file+'.tmp';try{fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}return {state,result};}
