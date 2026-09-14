// One preparation/freeze for the separately authorized eight-run development batch.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';

const repository = process.cwd(), local=path.resolve('local/native-sensitivity'), root=path.join(local,'diagnostic');
const old=path.resolve('local/native-task-h00-transfer');
if(fs.existsSync(root))throw Error('Do not replace an existing prepared campaign');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p));
const fixture=fs.readFileSync(path.join(local,'installed-with-dependencies.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s)).at(-1);
if(!fixture.passed||fixture.realProviderRequests!==0)throw Error('Installed fixture missing');
for(const id of ['weak-computed','weak-remove','control-computed','control-remove','strong-remove']) {
  const row=read(path.join(local,id,'result.json'));
  if(row.report.baseline?.status!=='passed'||row.realProviderRequests!==0||row.termination?.terminationVerified!==true)throw Error('Local supported baseline/termination missing: '+id);
}
const strong=read(path.join(local,'strong-remove/result.json')).report;
if(!strong.variants.some(m=>m.diff.includes('-false\n+true')&&m.status==='command-rejected'))throw Error('Useful historical regression chain missing');
const names=execFileSync('docker',['ps','--format','{{.Names}}'],{encoding:'utf8'}).trim().split('\n');
if(names.some(n=>n.startsWith('template-dev-')))throw Error('Existing development container still active');
const auth=read(path.join(os.homedir(),'.local/share/opencode/auth.json')).openai;
if(auth?.type!=='oauth'||!auth.access||!auth.accountId||auth.expires<=Date.now())throw Error('Existing authorization is unavailable or expired');
fs.mkdirSync(root);
const bundle=path.join(root,'bundle');materializeNativeTemplate({repositoryRoot:repository,outputDirectory:bundle,task:true});
for(const name of ['node_modules','package-lock.json','rg'])fs.cpSync(path.join(old,'bundle',name),path.join(bundle,name),{recursive:true,verbatimSymlinks:true});
fs.cpSync(path.resolve('profiles/native/sensitivity/node_modules'),path.join(bundle,'sensitivity/node_modules'),{recursive:true,verbatimSymlinks:true});
const config=read(path.join(bundle,'opencode.json'));config.instructions=['/template/core.md'];config.plugin=['file:///template/native-task-plugin.mjs'];
fs.writeFileSync(path.join(bundle,'opencode.json'),JSON.stringify(config,null,2)+'\n');
function manifest(dir) {
  const out={};
  function walk(current,prefix='') {
    for(const entry of fs.readdirSync(current,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      if(entry.name==='.git')continue;
      const file=path.join(current,entry.name),name=prefix+entry.name,st=fs.lstatSync(file);
      if(st.isDirectory())walk(file,name+'/');
      else if(st.isSymbolicLink()) {
        const link=fs.readlinkSync(file),target=path.resolve(path.dirname(file),link);
        if(path.isAbsolute(link)||!target.startsWith(dir+path.sep))throw Error('External prepared symlink');
        out[name]={symlink:link};
      }else if(st.isFile())out[name]={sha256:sha(fs.readFileSync(file)),executable:!!(st.mode&0o111)};
      else throw Error('Unsupported input entry');
    }
  }walk(dir);return out;
}
const cases=[
  ['case-1','quick-lru-computed','continuation-20260914/patches/37-quick-lru-computed-r2-H00.patch',['H0','H1']],
  ['case-2','denque-remove-where','continuation-20260914/patches/27-denque-remove-where-r2-P.patch',['H1','H0']],
  ['case-3','quick-lru-computed','patches/14-quick-lru-computed-r1-H00.patch',['H1','H0']],
  ['case-4','denque-remove-where','continuation-20260914/patches/28-denque-remove-where-r2-H00.patch',['H0','H1']],
];
const attempts=[],inputManifests={},files={};
for(const [id,task,patch,order] of cases) {
  const source=path.join(root,'inputs',id);fs.cpSync(path.join(old,'inputs',task),source,{recursive:true,verbatimSymlinks:true});
  const originalTask=fs.readFileSync(path.resolve('development/native-task-h00-transfer/tasks',task,'TASK.md'),'utf8');
  fs.writeFileSync(path.join(source,'TASK.md'),'An unfinished public patch is already present in this working tree. Verify it against the complete original request below and finish the delivery if necessary. Preserve correct existing work.\n\n'+originalTask);
  const seedPatch=path.resolve('development/native-task-h00-transfer',patch),seedSha256=sha(fs.readFileSync(seedPatch));
  const base=manifest(source),copy=fs.mkdtempSync(path.join(os.tmpdir(),'sensitivity-seed-'));
  let patched;
  try {
    fs.cpSync(source,copy,{recursive:true,verbatimSymlinks:true,filter:from=>!path.relative(source,from).split(path.sep).includes('node_modules')});
    execFileSync('git',['init','-q'],{cwd:copy});execFileSync('git',['apply','--check',seedPatch],{cwd:copy});execFileSync('git',['apply',seedPatch],{cwd:copy});
    patched={...Object.fromEntries(Object.entries(base).filter(([n])=>n.startsWith('node_modules/'))),...manifest(copy)};
  }finally{fs.rmSync(copy,{recursive:true,force:true});}
  for(const arm of order) {
    attempts.push({slot:attempts.length+1,task:id,originalTask:task,project:task.startsWith('quick-lru')?'quick-lru':'denque',arm,source,seedPatch,seedSha256});
    inputManifests[id+'-'+arm]=patched;
  }
  files[seedPatch]=seedSha256;files[path.join(source,'TASK.md')]=sha(fs.readFileSync(path.join(source,'TASK.md')));
}
for(const name of [
  'lib/native-task-plugin.mjs','lib/native-task-workflow.mjs','lib/native-task-observations.mjs','lib/native-review-context.mjs','lib/native-sensitivity.mjs','lib/native-sensitivity-runner.mjs','lib/native-project-scope.mjs',
  'development/native-task-sensitivity/PLAN.md','development/native-task-sensitivity/RUBRIC.md','development/native-task-sensitivity/run.mjs',
  'development/native-task-ab/native-run.mjs','development/native-task-ab/run-comparison.mjs','development/native-task-ab/container-session.mjs','development/native-task-ab/container-relay.mjs','development/native-task-ab/capture-candidate.mjs','development/native-task-ab/extract-candidate.py','development/native-task-abc/native-run.mjs','development/native-task-utility/container/stop-workload.mjs',
])files[path.resolve(name)]=sha(fs.readFileSync(name));
const oldFreeze=read(path.join(old,'freeze.json'));
const preservation=Object.fromEntries(['scheduling-paused.json','outcome.json','continuation-19-48/scheduling-paused.json','continuation-19-48/outcome.json'].map(n=>[n,sha(fs.readFileSync(path.join(old,n)))]));
const freeze={version:1,experimentKind:'sensitivity',createdAt:new Date().toISOString(),model:'openai/gpt-5.6-luna',variant:'high',budgetMs:900000,strategy:'direct',preflightPassed:true,streamLimit:'remaining-task-budget',connectionTimeoutMs:30000,toolchain:oldFreeze.toolchain,template:bundle,dependencies:bundle,config:read(path.join(old,'experiment-config.json')),attempts,inputManifests,files,runtimeManifests:{[bundle]:manifest(bundle)}};
fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify(freeze),{flag:'wx'});
fs.writeFileSync(path.join(root,'admission.json'),JSON.stringify({createdAt:freeze.createdAt,freezeSha256:sha(JSON.stringify(freeze)),cases:cases.map(([id,task,patch,order])=>({id,task,patch,order})),historicalPreservation:preservation,liveOldDevelopmentContainers:0,authorizationValid:true,realProviderRequests:0,limits:{variants:8,taskDiagnosticMs:180000},localLimitation:'Standard selected mutations do not expose the named default-TTL gap; denque empty-input behavior has a real weak-to-strong discrimination.'},null,2)+'\n');
console.log(JSON.stringify({frozen:true,root,attempts:attempts.length,realProviderRequests:0}));
