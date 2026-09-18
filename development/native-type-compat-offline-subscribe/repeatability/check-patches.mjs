import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.resolve('local/native-type-compat-offline-subscribe/repeatability'),rows=[];
assert.ok(fs.existsSync(root+'/outcome.json'));
for(const row of JSON.parse(fs.readFileSync(root+'/neutral/inputs.json'))){const copy=root+'/neutral/'+row.id+'-applied';assert.ok(!fs.existsSync(copy));fs.cpSync(root+'/inputs/A',copy,{recursive:true,verbatimSymlinks:true,filter:p=>!['.git','node_modules'].includes(path.basename(p))});
 const git=args=>{const r=spawnSync('git',args,{cwd:copy,encoding:'utf8',maxBuffer:16*1024*1024});return{status:r.status,stdout:r.stdout,stderr:r.stderr};};
 for(const args of [['init','-q'],['add','.'],['-c','core.hooksPath=/dev/null','-c','user.name=Evaluator','-c','user.email=evaluator@localhost','commit','-qm','Frozen source']])assert.equal(git(args).status,0);
 const check=git(['apply','--check','--binary',row.patch]),apply=check.status===0?git(['apply','--index','--binary',row.patch]):null;
 const names=apply?.status===0?git(['diff','--cached','--name-only']).stdout.trim().split('\n'):[],summary=apply?.status===0?git(['diff','--cached','--summary']):null,whitespace=apply?.status===0?git(['diff','--cached','--check']):null;
 const modes=apply?.status===0?git(['ls-files','--stage']).stdout:null;
 const forbidden=names.filter(n=>/(^|\/)(\.git|\.opencode|\.harness|node_modules|TASK\.md)(\/|$)|harness-task/.test(n));
 const contentHits=[];for(const n of names){if(!fs.existsSync(copy+'/'+n))continue;const text=fs.readFileSync(copy+'/'+n,'utf8');if(/\/template\/|\/work\/|harness_task|native-type-compat/.test(text))contentHits.push(n);}
 rows.push({id:row.id,sha256:createHash('sha256').update(fs.readFileSync(row.patch)).digest('hex'),applyCheck:check,apply,changed:names,modeChanges:summary?.stdout,finalModes:modes,sourceWhitespace:whitespace,forbiddenPaths:forbidden,serviceContentHits:contentHits});
}
fs.writeFileSync(root+'/patch-checks.json',JSON.stringify(rows,null,2),{flag:'wx'});console.log(JSON.stringify(rows.map(({finalModes,...r})=>r)));
