import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {manifest} from '../../native-task-integrated/run.mjs';
const root=path.resolve('local/native-type-compat-offline-subscribe/repeatability'),old=path.resolve('local/native-type-compat-offline-subscribe/batch'),dev=path.resolve('development/native-type-compat-offline-subscribe/repeatability');
const read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex'),prior=read(dev+'/../frozen-inputs.json');
assert.ok(!fs.existsSync(root));
const changed='development/native-task-ab/run-comparison.mjs',verified={};
for(const [file,digest]of Object.entries(prior.hashes)){if(file===changed){assert.equal(hash(execFileSync('git',['show','6e832638:'+file])),digest);continue;}assert.equal(hash(fs.readFileSync(file)),digest,file);verified[file]=digest;}
assert.equal(hash(fs.readFileSync(old+'/inputs/A/TASK.md')),prior.actualPromptSha256);
const inputs=manifest(old+'/inputs/A');assert.equal(hash(JSON.stringify(inputs)),prior.inputManifestSha256);
fs.mkdirSync(root,{recursive:true,mode:0o700});fs.mkdirSync(root+'/inputs');
fs.cpSync(old+'/inputs/A',root+'/inputs/A',{recursive:true,verbatimSymlinks:true});
fs.symlinkSync(old+'/bundle',root+'/bundle');fs.copyFileSync(old+'/experiment-config.json',root+'/experiment-config.json');
for(const [n,h] of Object.entries(prior.hashes).filter(([n])=>n.includes('/bundle/native-'))){assert.ok(execFileSync('git',['show',prior.runtimeSha+':lib/'+path.basename(n)]).equals(fs.readFileSync(n)));}
const attempts=['ON','OFF','OFF','ON'].map((arm,i)=>({slot:i+1,task:'A',repetition:i<2?1:2,arm,project:'primus/eventemitter3',source:root+'/inputs/A'}));
const record={createdAt:new Date().toISOString(),runtimeSha:prior.runtimeSha,previousPublication:'6e832638f840c7f732321900af18ec0fdd85966d',sourceCommit:prior.sourceCommit,order:attempts.map(({source,...a})=>a),actualPromptSha256:prior.actualPromptSha256,inputManifestSha256:prior.inputManifestSha256,verifiedPriorHashes:verified,launcherBefore:prior.hashes[changed],launcherAfter:hash(fs.readFileSync(changed)),criteria:{mechanism:'At least one new ON: new incompatibility -> received compiler evidence -> correct repair -> full feature retained',delivery:'ON D count exceeds OFF, not solely external interruption',positive:'Both ON D=true AND more ON D than OFF AND mechanism repeated',incomplete:'Not-started slots unknown; no replacements or continuation'},realProviderRequests:0};
fs.writeFileSync(root+'/preparation.json',JSON.stringify(record,null,2),{flag:'wx'});fs.writeFileSync(dev+'/manifest.json',JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log('Prior hashes, exact prompt and entire baseline manifest verified; four slots assigned; zero provider requests.');
