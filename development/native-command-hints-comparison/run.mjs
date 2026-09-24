// Campaign wiring only. Reuse the existing scheduler, relay, transport and native session.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';
import {runComparison} from '../native-task-ab/run-comparison.mjs';
import {startContainer as start} from '../native-task-integrated/container-session.mjs';
import {runTask} from '../native-task-integrated/native-run.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../native-task-ab/capture-candidate.mjs';
const readAuth=()=>{const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())throw Error('Existing authorization unavailable or expired');return{access:a.access,accountId:a.accountId};};
const fingerprints=session=>{
 const r=session.exec(['node','-e',`const fs=require('fs'),path=require('path'),{createHash}=require('crypto'),out={};function walk(d,p=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name),k=p+e.name;if(e.isDirectory()){if(e.name!=='.cache')walk(f,k+'/');}else if(k!=='vitest/dist/tsconfig.tmp.tsbuildinfo')out[k]=e.isSymbolicLink()?{link:fs.readlinkSync(f)}:{hash:createHash('sha256').update(fs.readFileSync(f)).digest('hex'),mode:fs.statSync(f).mode&511};}}walk('/work/repo/node_modules');console.log(JSON.stringify(out));`]);
 if(r.status!==0)throw Error('Dependency fingerprint unavailable: '+r.stderr);return JSON.parse(r.stdout);
};
const runTaskImplementation=async(session,options)=>{
 const before=fingerprints(session);const result=await runTask(session,options);const after=fingerprints(session);
 const changes=[...new Set([...Object.keys(before),...Object.keys(after)])].filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
 fs.writeFileSync(path.join(session.output,'dependency-integrity.json'),JSON.stringify({entriesBefore:Object.keys(before).length,entriesAfter:Object.keys(after).length,unchanged:changes.length===0,changes,excludedGeneratedCaches:['.cache/**','vitest/dist/tsconfig.tmp.tsbuildinfo']},null,2));return result;
};
export const run=root=>runComparison({root,startContainer:a=>start({...a,workMemoryMb:1536,memoryMb:3072}),stopWorkload,captureCandidate,readAuth,runTaskImplementation});
if(process.argv[1]===fileURLToPath(import.meta.url))await run(path.resolve(process.argv[2]));
