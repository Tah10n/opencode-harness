import fs from 'node:fs';export function load(file){return JSON.parse(fs.readFileSync(file,'utf8'));}export function save(file,value){fs.writeFileSync(file,JSON.stringify(value));}
