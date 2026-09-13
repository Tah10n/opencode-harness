import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]??'local/native-task-ab');
const repository=process.cwd();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function manifest(directory){
 const files={};
 function walk(dir,prefix=''){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   if(entry.name==='.git')continue;
   const file=path.join(dir,entry.name),name=prefix+entry.name,stat=fs.lstatSync(file);
   if(stat.isSymbolicLink()){
    const target=fs.readlinkSync(file),resolved=path.resolve(path.dirname(file),target);
    if(path.isAbsolute(target)||!resolved.startsWith(directory+'/'))throw Error('Uncontained frozen link: '+file);
    files[name]={symlink:target};
   }else if(stat.isDirectory())walk(file,name+'/');
   else if(stat.isFile())files[name]={sha256:hash(fs.readFileSync(file)),executable:!!(stat.mode&0o111)};
   else throw Error('Unsupported frozen entry: '+file);
  }
 }walk(directory);return files;
}
const tasks=JSON.parse(fs.readFileSync('development/native-task-ab/tasks.json'));
const preflight=JSON.parse(fs.readFileSync(path.join(root,'installed-preflight.json')));
if(!preflight.passed||preflight.realProviderRequests!==0)throw Error('Missing technical preflight');
const arms=['P','H00','H10','H01','H11'],attempts=[],inputManifests={};
for(const [row,task] of tasks.entries()){
 const source=path.join(root,'inputs',task.id),m=manifest(source);
 if(fs.readFileSync(path.join(source,'TASK.md'),'utf8')!==fs.readFileSync(task.taskFile,'utf8'))throw Error('Task mismatch');
 const order=row<5?arms.slice(row).concat(arms.slice(0,row)):[...arms].reverse();
 for(const arm of order){attempts.push({slot:attempts.length+1,task:task.id,project:task.project,arm,source});inputManifests[task.id+'-'+arm]=m;}
 const full=JSON.parse(fs.readFileSync(path.join(root,'full-controls-final',task.id,'result.json')));
 if(full.exit!==0||full.termination?.terminationVerified!==true)throw Error('Full reference failed: '+task.id);
}
const files={};
const candidates=execFileSync('rg',['--files','--hidden','lib','agents','development/native-task-ab','development/native-task-abc','development/native-task-utility/container','scripts'],{encoding:'utf8'}).trim().split('\n')
 .filter(n=>n.startsWith('lib/')||n.startsWith('agents/')||n.startsWith('development/native-task-ab/')||n==='development/native-task-abc/native-run.mjs'||n.startsWith('development/native-task-utility/container/')||['scripts/verify-native-project-feedback.mjs','scripts/verify-native-task-fixture.mjs'].includes(n));
for(const name of [...candidates,'package.json','package-lock.json','docs/native-task/PROJECT-FEEDBACK.md'])files[path.resolve(name)]=hash(fs.readFileSync(name));
for(const task of tasks){
 for(const name of ['result.json','files.json']){
  const file=path.join(root,'full-controls-final',task.id,name);files[file]=hash(fs.readFileSync(file));
 }
 const calibration=path.join(root,task.project==='emittery'?'calibration-final':'calibration',task.id,'results.json');
 const rows=JSON.parse(fs.readFileSync(calibration));
 if(rows.length<4||rows.some(r=>!r.matched))throw Error('Incomplete rubric calibration');
 files[calibration]=hash(fs.readFileSync(calibration));
}
for(const name of ['installed-preflight.json','sources.json','preparation-incidents.json','evaluator-incidents.json','capture-preflight/result.json']){const file=path.join(root,name);files[file]=hash(fs.readFileSync(file));}
const toolchain=path.resolve('../verified-change-harness/local/template-toolchain-20260908');
for(const directory of ['bundle','plain-dependencies']){
 const m=manifest(path.join(root,directory));
 fs.writeFileSync(path.join(root,directory+'-manifest.json'),JSON.stringify(m));
 // Pin runtime bytes and dependency manifest once; each slot checks these files.
 files[path.join(root,directory+'-manifest.json')]=hash(JSON.stringify(m));
 for(const [name,value] of Object.entries(m))if(!name.startsWith('node_modules/')&&value.sha256)files[path.join(root,directory,name)]=value.sha256;
}
const freeze={version:1,createdAt:new Date().toISOString(),repository,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),model:'openai/gpt-5.6-luna',variant:'high',budgetMs:900000,strategy:'direct',preflightPassed:true,toolchain,template:path.join(root,'bundle'),dependencies:path.join(root,'plain-dependencies'),config:JSON.parse(fs.readFileSync(path.join(root,'experiment-config.json'))),attempts,inputManifests,files};
fs.writeFileSync(path.join(root,'freeze.json'),JSON.stringify(freeze),{flag:'wx'});
fs.writeFileSync(path.join(root,'freeze-summary.json'),JSON.stringify({...freeze,inputManifests:Object.fromEntries(tasks.map(t=>[t.id,{files:Object.keys(inputManifests[t.id+'-P']).length,sha256:hash(JSON.stringify(inputManifests[t.id+'-P']))}]))},null,2)+'\n');
console.log(JSON.stringify({frozen:true,slots:attempts.length,freezeSha256:hash(fs.readFileSync(path.join(root,'freeze.json'))),realProviderRequests:0}));
