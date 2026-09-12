import * as nativeFs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {selectPaths} from './selection.mjs';
export async function buildManifest(root,paths,{exclude=[],fs=nativeFs}={}){
 const selected=selectPaths(paths,exclude),out=[];
 for(const relative of selected){const file=path.join(root,relative),stat=await fs.stat(file);if(!stat.isFile())continue;const bytes=await fs.readFile(file);out.push({path:relative,bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex')});}
 return out;
}
