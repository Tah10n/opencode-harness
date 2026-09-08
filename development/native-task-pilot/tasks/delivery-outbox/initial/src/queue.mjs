import fs from 'node:fs';
export function loadQueue(file){try{const value=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(value))throw new TypeError('Invalid queue');return value;}catch(error){if(error.code==='ENOENT')return [];throw error;}}
export function saveQueue(file,state){fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);}
