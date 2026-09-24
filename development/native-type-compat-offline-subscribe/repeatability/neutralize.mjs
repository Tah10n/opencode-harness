// Do not print the arm mapping until patch review has been recorded.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {randomInt,createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=path.resolve('local/native-type-compat-offline-subscribe/repeatability');assert.ok(fs.existsSync(root+'/outcome.json'),'Wait for terminal launcher state');
const rows=JSON.parse(fs.readFileSync(root+'/freeze.json')).attempts.filter(a=>fs.existsSync(root+'/runs/'+a.task+'-r'+a.repetition+'-'+a.arm+'/started.json'));
for(let i=rows.length-1;i>0;i--){const j=randomInt(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}
const dir=root+'/neutral';fs.mkdirSync(dir);const inputs=[],mapping=[];
for(const [i,row]of rows.entries()){
 const id='n'+String(i+1).padStart(2,'0'),run=root+'/runs/'+row.task+'-r'+row.repetition+'-'+row.arm,candidate=run+'/candidate',artifacts=candidate+'/.git/harness-task';let patch=Buffer.alloc(0),kind='captured-baseline';
 const entries=fs.existsSync(artifacts)?fs.readdirSync(artifacts).filter(n=>fs.statSync(artifacts+'/'+n).isDirectory()):[];assert.ok(entries.length<=1,'Ambiguous workflow');
 const artifact=entries.length?artifacts+'/'+entries[0]:null;
 if(artifact&&fs.existsSync(artifact+'/terminal.patch')){patch=fs.readFileSync(artifact+'/terminal.patch');kind='terminal';}
 else if(artifact&&fs.existsSync(artifact+'/worktree')){
  const copy=dir+'/'+id+'-recovery';fs.cpSync(root+'/inputs/'+row.task,copy,{recursive:true,verbatimSymlinks:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});
  const git=a=>execFileSync('git',a,{cwd:copy,encoding:'utf8',maxBuffer:16*1024*1024});git(['init','-q']);git(['add','.']);git(['-c','core.hooksPath=/dev/null','-c','user.name=Recovery','-c','user.email=recovery@localhost','commit','-qm','Frozen baseline']);
  const work=artifact+'/worktree';for(const name of git(['ls-files','-z']).split('\0').filter(Boolean))if(!fs.existsSync(work+'/'+name))fs.unlinkSync(copy+'/'+name);
  fs.cpSync(work,copy,{recursive:true,verbatimSymlinks:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});git(['add','-A']);patch=Buffer.from(git(['diff','--cached','--binary','HEAD']));kind='recovered-after-interruption';
 }
 const file=dir+'/'+id+'.patch';fs.writeFileSync(file,patch,{flag:'wx'});inputs.push({id,task:row.task,patch:file});mapping.push({id,slot:row.slot,task:row.task,arm:row.arm,kind,sha256:createHash('sha256').update(patch).digest('hex'),bytes:patch.length});
}
fs.writeFileSync(dir+'/inputs.json',JSON.stringify(inputs,null,2)+'\n');fs.writeFileSync(dir+'/mapping.json',JSON.stringify(mapping,null,2)+'\n');console.log(JSON.stringify({neutralPatches:inputs.map(({id,task})=>({id,task})),mappingWithheld:true}));
