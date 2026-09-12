import fs from 'node:fs';
function valid(value){if(!value||Array.isArray(value)||typeof value!=='object'||typeof value.text!=='string')throw new TypeError('Document requires text');return value;}
function parse(file){return valid(JSON.parse(fs.readFileSync(file,'utf8')));}
export function load(file){try{return parse(file);}catch(first){try{return parse(file+'.bak');}catch{throw first;}}}
export function save(file,value){valid(value);const bytes=JSON.stringify(value);let old;try{old=fs.readFileSync(file);valid(JSON.parse(old));}catch(e){if(e.code!=='ENOENT')throw e;}const tmp=file+'.tmp';try{if(old!==undefined)fs.writeFileSync(file+'.bak',old);fs.writeFileSync(tmp,bytes);fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
