// Host-only preparation. Never mounts mapping, grades, or this script into a selector.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const base=process.cwd(),root=path.resolve(process.argv[2]);
const prior=path.join(base,'local/native-task-utility-v3-20260912');
const old=JSON.parse(fs.readFileSync(path.join(prior,'freeze.json')));
const plan=JSON.parse(fs.readFileSync('development/native-task-utility/plan-v3.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
export function manifest(root){const out={};function walk(dir,p=''){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(e.name==='.git')continue;const file=path.join(dir,e.name),rel=p+e.name,st=fs.lstatSync(file);assert.ok(!st.isSymbolicLink(),rel);if(st.isDirectory())walk(file,rel+'/');else{assert.ok(st.isFile());out[rel]={sha256:sha(fs.readFileSync(file)),executable:!!(st.mode&0o111)};}}}walk(root);return out;}
const git=(cwd,args)=>{const r=spawnSync('git',['-c','core.hooksPath=/dev/null',...args],{cwd,encoding:'utf8',maxBuffer:32*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout;};
assert.ok(!fs.existsSync(path.join(root,'freeze.json')),'Never overwrite a freeze');
fs.mkdirSync(path.join(root,'inputs'),{recursive:true,mode:0o700});
const files={},mapping=[],attempts=[],inputManifests={};
const freezeFile=file=>{files[file]=sha(fs.readFileSync(file));};
// Balance X/Y before any model calls. This mapping is host-only until all sessions end.
for(const [i,t] of plan.tasks.entries()){
 const key='c'+String(i+1).padStart(2,'0'),source=path.join(root,'inputs',key),initial=path.join(prior,'tasks',t.id,'initial');
 const original=manifest(initial);assert.deepEqual(original,JSON.parse(fs.readFileSync(path.join(prior,'tasks',t.id,'initial-manifest.json'))));
 fs.mkdirSync(source);fs.cpSync(initial,path.join(source,'base'),{recursive:true});
 const task=fs.readFileSync(path.join(initial,'TASK.md'));assert.ok(task.equals(fs.readFileSync(path.join(base,'development/native-task-utility/tasks',t.id,'TASK.md'))));fs.writeFileSync(path.join(source,'TASK.md'),task);
 const row={slot:i+1,task:t.id,candidates:{}};
 for(const [j,label] of ['X','Y'].entries()){
  const arm=(i+j)%2===0?'P':'H',patch=path.join(base,'development/native-task-utility/patches/v3',t.id+'-'+arm+'-final.patch'),candidate=path.join(source,label);
  fs.cpSync(initial,candidate,{recursive:true});git(candidate,['init','-q']);git(candidate,['add','-A']);git(candidate,['-c','user.name=Prepared','-c','user.email=prepared@localhost','commit','-qm','Original public snapshot']);
  git(candidate,['apply','--check',patch]);git(candidate,['apply',patch]);
  assert.deepEqual(manifest(candidate),manifest(path.join(prior,'deliveries',t.id+'-'+arm+'-final','project')),'Exact retained delivery bytes');
  fs.rmSync(path.join(candidate,'.git'),{recursive:true});fs.copyFileSync(patch,path.join(source,label+'.patch'));
  row.candidates[label]={arm,patch:path.relative(base,patch),patchSha256:sha(fs.readFileSync(patch)),treeSha256:sha(JSON.stringify(manifest(candidate)))};freezeFile(patch);
 }
 mapping.push(row);attempts.push({slot:i+1,task:t.id,source});inputManifests[t.id]=manifest(source);
 for(const p of [source,initial])for(const rel of Object.keys(manifest(p)))freezeFile(path.join(p,rel));
}
const dependencies=path.join(root,'dependencies');fs.cpSync(old.dependencies,dependencies,{recursive:true});
fs.cpSync('/Users/tahion/.cache/node/corepack/v1/pnpm/11.7.0',path.join(dependencies,'corepack/v1/pnpm/11.7.0'),{recursive:true});
fs.writeFileSync(path.join(dependencies,'corepack/lastKnownGood.json'),JSON.stringify({pnpm:'11.7.0'}));
const prompt=path.resolve('development/native-task-selection/PROMPT.md');
for(const file of [prompt,path.resolve('development/native-task-selection/run-selection.mjs'),path.resolve('development/native-task-selection/container-setup.mjs'),path.resolve('development/native-task-selection/prepare.mjs'),old.containerAdapter,path.resolve('development/native-task-abc/native-run.mjs'),path.resolve('development/native-task-utility/container/container-relay.mjs'),path.resolve('development/native-task-utility/container/stop-workload.mjs'),path.join(old.toolchain,'package/bin/opencode')])freezeFile(file);
for(const rel of Object.keys(manifest(dependencies)))freezeFile(path.join(dependencies,rel));
const config=structuredClone(old.config);
config.permission={external_directory:{'*':'deny','/input/**':'allow','/work/diagnostics/**':'allow'},edit:{'*':'deny','/work/diagnostics/**':'allow'},task:'deny',webfetch:'deny',websearch:'deny'};
config.agent={title:{disable:true},summary:{disable:true}};
const f={candidate:'ea6cf2ab5260077e92df30d4a945c24146df9244',model:old.model,variant:'high',budgetMs:300000,openCode:'1.18.26',toolchain:old.toolchain,dependencies,containerAdapter:old.containerAdapter,config,prompt,promptSha256:sha(fs.readFileSync(prompt)),attempts,inputManifests,files,preflightPassed:false,createdAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,'mapping.json'),JSON.stringify(mapping,null,2),{flag:'wx',mode:0o600});
fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify(f,null,2),{flag:'wx',mode:0o600});
fs.mkdirSync(path.join(root,'scripted-preflight'));
fs.writeFileSync(path.join(root,'scripted-preflight/freeze.json'),JSON.stringify({toolchain:old.toolchain,template:old.template,containerAdapter:old.containerAdapter,captureAdapter:old.captureAdapter,nativeAdapter:old.nativeAdapter},null,2));
console.log(JSON.stringify({prepared:attempts.length,patches:12,promptSha256:f.promptSha256,providerRequests:0}));
