import fs from 'node:fs';import {normalize} from './schema.mjs';
export function load(file){return normalize(JSON.parse(fs.readFileSync(file,'utf8')));}
export function save(file,value){const normalized=normalize(value);const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(normalized));fs.renameSync(temporary,file);}
