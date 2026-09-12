// Preparation checks only: no grader, expected answers, or candidate execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
export function prepareSelector(session,expected){
 const setup=session.exec(['node','-e',String.raw`
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);
fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true});
fs.mkdirSync('/work/cache/node',{recursive:true});fs.symlinkSync('/template/corepack','/work/cache/node/corepack');
for(const label of ['X','Y','base'])for(const name of ['home','tmp','config','data','cache','state'])fs.mkdirSync('/work/diagnostics/'+label+'/'+name,{recursive:true});
// The relay creates a writable staging copy. Replace it with aliases to the immutable inputs.
for(const e of fs.readdirSync('/input')){fs.rmSync('/work/repo/'+e,{recursive:true});fs.symlinkSync('/input/'+e,'/work/repo/'+e);}
const refusals=[];for(const label of ['base','X','Y'])for(const [kind,fn]of [
 ['create',()=>fs.writeFileSync('/input/'+label+'/.selector-write-probe','probe')],
 ['overwrite',()=>fs.appendFileSync('/input/'+label+'/TASK.md','probe')],
 ['chmod',()=>fs.chmodSync('/input/'+label+'/TASK.md',0o777)],
 ['rename',()=>fs.renameSync('/input/'+label+'/TASK.md','/input/'+label+'/.renamed')]
]){let code;try{fn();}catch(e){code=e.code;}assert.equal(code,'EROFS',label+':'+kind);refusals.push({label,kind,code});}
assert.deepEqual(fs.readdirSync('/input').sort(),['TASK.md','X','X.patch','Y','Y.patch','base']);
fs.writeFileSync('/work/diagnostics/X/isolation-probe','X');assert.ok(!fs.existsSync('/work/diagnostics/Y/isolation-probe'));fs.unlinkSync('/work/diagnostics/X/isolation-probe');
const checks=[];for(const [command,args]of [['node',['--version']],['npm',['--version']],['corepack',['pnpm','--version']],['/opt/opencode',['--version']]]){
 const r=spawnSync(command,args,{cwd:'/input/X',encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);checks.push({command:[command,...args],output:r.stdout.trim()});
}
assert.equal(checks[2].output,'11.7.0');assert.equal(checks[3].output,'1.18.26');
for(const label of ['X','Y']){const pkg=JSON.parse(fs.readFileSync('/input/'+label+'/package.json'));assert.ok(pkg.scripts.test);const connector='/input/'+label+'/packages/connector';if(fs.existsSync(connector)){const p=JSON.parse(fs.readFileSync(connector+'/package.json'));assert.equal(p.scripts.test,'node --test');assert.ok(!p.dependencies||Object.keys(p.dependencies).length===0);}else assert.match(pkg.scripts.test,/node --test/);}
console.log(JSON.stringify({refusals,checks,isolatedDiagnostics:true,inputTopLevelVerified:true,network:'none',scope:'preparation only; no candidate grades'}));
`]);
 assert.equal(setup.status,0,setup.stderr);
 const install=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/config/opencode/plugins',{recursive:true});fs.writeFileSync('/work/config/opencode/plugins/selection.mjs',Buffer.from(process.argv[1],'base64'));",fs.readFileSync(new URL('./selection-plugin.mjs',import.meta.url)).toString('base64')]);
 assert.equal(install.status,0,install.stderr);const facts=JSON.parse(setup.stdout);
 const got=inputManifest(session);assert.deepEqual(got,expected,'Read-only container bytes/modes match frozen inputs');
 return {...facts,matchedFiles:Object.keys(got).length};
}
export function inputManifest(session){
 const result=session.exec(['node','-e',String.raw`const fs=require('fs'),path=require('path'),{createHash}=require('crypto'),out={};function walk(dir,p=''){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name),rel=p+e.name,st=fs.lstatSync(file);if(st.isSymbolicLink())throw Error('Unexpected symlink');if(st.isDirectory())walk(file,rel+'/');else out[rel]={sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),executable:!!(st.mode&0o111)};}}walk('/input');console.log(JSON.stringify(out));`]);
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
}
