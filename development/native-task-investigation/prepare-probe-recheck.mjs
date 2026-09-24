// Explicit exception for the preserved false text-extraction pause; no new probe.
import {recheckSavedAvailability} from './availability-probe.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]),read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const f=read(root+'/freeze.json'),previous=read(root+'/amendment-2-9.json');
assert.equal(hash(root+'/freeze.json'),read('development/native-task-investigation/frozen-inputs.json').freezeSha256);
assert.equal(f.runtimeSha,'9cd8ffb4dfcfd32f1a7a65ac9c3eaca44728d2e7');
assert.ok(!fs.existsSync(root+'/continuation-3-9-rechecked'));assert.ok(!fs.existsSync(root+'/amendment-3-9-rechecked.json'));
const saved=recheckSavedAvailability(root);assert.equal(saved.success,true);
assert.ok(!fs.existsSync(root+'/continuation-3-9/runs'));
assert.deepEqual(fs.readdirSync(root+'/continuation-3-9').sort(),['admission.json','availability.json','availability.sse','scheduling-paused.json']);
assert.deepEqual(fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('continuation-')).map(e=>e.name).sort(),['continuation-2-9','continuation-3-9']);
const launcherFiles=Object.fromEntries(Object.entries(previous.launcherFiles).map(([p,v])=>[p,{before:v.before,after:hash(p)}]));
for(const [p,h]of Object.entries(f.files))if(!launcherFiles[p])assert.equal(hash(p),h,p);
// Verify the exact sources/dependencies before starting any remaining task.
for(const a of f.attempts.filter((a,i,all)=>all.findIndex(b=>b.source===a.source)===i)){
 const expected=f.inputManifests[a.task+'-'+a.arm],seen=new Set();
 function visit(dir,prefix=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==='.git')continue;const p=dir+'/'+e.name,n=prefix+e.name,st=fs.lstatSync(p);if(st.isDirectory())visit(p,n+'/');else{const got=st.isSymbolicLink()?{symlink:fs.readlinkSync(p)}:{sha256:hash(p),executable:!!(st.mode&0o111)};assert.deepEqual(got,expected[n],n);seen.add(n);}}}visit(a.source);assert.equal(seen.size,Object.keys(expected).length);
}
assert.deepEqual(fs.readdirSync(root+'/runs'),['quick-lru-take-P']);assert.deepEqual(fs.readdirSync(root+'/continuation-2-9/runs'),['quick-lru-take-R']);
const names=execFileSync('docker',['ps','-a','--format','{{.Names}}'],{encoding:'utf8'}).split('\n'),historicalFiles={};
for(const rel of ['runs/quick-lru-take-P','continuation-2-9/runs/quick-lru-take-R']){
 const stop=read(root+'/'+rel+'/stop-verification.json');assert.ok(stop.terminationVerified&&stop.captureSaved&&stop.forwardingClosed&&stop.relayRemoved&&stop.activeProviderHandlers===0);assert.equal(read(root+'/'+rel+'/session/cleanup.json').status,0);assert.ok(!names.includes(read(root+'/'+rel+'/session/container.json').name));
 function visit(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==='candidate')continue;const p=dir+'/'+e.name,n=prefix+'/'+e.name;if(e.isDirectory())visit(p,n);else{assert.ok(e.isFile());historicalFiles[n]=hash(p);}}}visit(root+'/'+rel,rel);
}
for(const n of ['admission.json','availability.json','availability.sse','scheduling-paused.json'])historicalFiles['continuation-3-9/'+n]=hash(root+'/continuation-3-9/'+n);
const launcherCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const amendment={version:1,firstSlot:3,lastSlot:9,availabilityRequests:0,savedProbeReportSha256:saved.sourceHashes.report,savedProbePauseSha256:saved.sourceHashes.pause,runtimeSha:f.runtimeSha,launcherCommit,originalFreezeSha256:hash(root+'/freeze.json'),originalPauseSha256:hash(root+'/scheduling-paused.json'),previousPauseSha256:hash(root+'/continuation-2-9/scheduling-paused.json'),launcherFiles,historicalFiles,additionalLauncherFiles:Object.fromEntries(['availability-probe.mjs','prepare-availability.mjs','prepare-probe-recheck.mjs'].map(n=>[n,hash('development/native-task-investigation/'+n)])),policy:'Explicit exception only for the false availability_not_confirmed text-extraction pause. Recheck the preserved completed probe offline; zero new availability requests. Run only original slots 3–9 once, stop on any new external failure or unverified execution. Preserve all three old pauses; historical remote outcomes remain unknown.',preparedAt:new Date().toISOString()};
fs.writeFileSync(root+'/amendment-3-9-rechecked.json',JSON.stringify(amendment,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({prepared:true,firstSlot:3,lastSlot:9,providerRequests:0,historicalEvidenceFiles:Object.keys(historicalFiles).length,launcherCommit}));
