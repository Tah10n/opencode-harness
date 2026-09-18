function valid(value){return typeof value==='string'&&value.length>0&&!value.includes('\\')&&!value.includes('\0')&&value.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');}
function selectPaths(paths,exclude=[]){
 if(!paths.every(valid)||!exclude.every(valid))throw new TypeError('path');
 return [...new Set(paths)].filter(name=>!exclude.some(prefix=>name===prefix||name.startsWith(prefix+'/'))).sort();
}
import * as nativeFs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
export async function buildManifest(root,paths,{exclude=[],fs=nativeFs}={}){
 const selected=selectPaths(paths,exclude),out=[];
 for(const relative of selected){const file=path.join(root,relative),stat=await fs.stat(file);if(!stat.isFile())continue;const bytes=await fs.readFile(file);out.push({path:relative,bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex')});}
 return out;
}
