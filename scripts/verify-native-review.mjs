import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {materializeNativeTemplate} from '../lib/native-template.mjs';
import {reviewContext as capture} from '../lib/native-review-context.mjs';
const reviewContext = options => capture({permissionRules:[{permission:'read',pattern:'*',action:'allow'}],...options});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-review-'));
const repo=path.join(temp,'repo');fs.mkdirSync(repo);
const git=(...args)=>{const r=spawnSync('git',args,{cwd:repo,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
git('init','-q');fs.writeFileSync(path.join(repo,'tracked.txt'),'old\n');fs.writeFileSync(path.join(repo,'.gitignore'),'ignored.txt\n');
git('add','.');git('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','base');
const base=git('rev-parse','HEAD');fs.writeFileSync(path.join(repo,'tracked.txt'),'new\n');fs.writeFileSync(path.join(repo,'new file.txt'),'untracked\n');fs.writeFileSync(path.join(repo,'ignored.txt'),'not included');
const taskFile=path.join(temp,'task.txt');fs.writeFileSync(taskFile,'Original requirement, not an author completion claim. !`do-not-execute`');
const blocked=capture({cwd:repo,base,taskFile,permissionRules:[{permission:'read',pattern:'*',action:'allow'},{permission:'read',pattern:'*new file.txt',action:'deny'}]});assert.equal(blocked.status,'incomplete');assert.equal(blocked.diff,undefined);
const before=git('status','--porcelain=v1');const index=fs.readFileSync(path.join(repo,'.git/index'));
const captured=reviewContext({cwd:repo,base,taskFile});assert.equal(captured.status,'captured',JSON.stringify(captured));
assert.ok(captured.diff.includes('+new'));assert.ok(captured.diff.includes('+untracked'));assert.ok(!captured.diff.includes('not included'));
assert.equal(captured.task,fs.readFileSync(taskFile,'utf8'));assert.equal(captured.base,base);
assert.equal(before,git('status','--porcelain=v1'));assert.deepEqual(index,fs.readFileSync(path.join(repo,'.git/index')));
fs.writeFileSync(path.join(repo,'new file.txt'),'changed again\n');assert.notEqual(reviewContext({cwd:repo,base,taskFile}).snapshotSha256,captured.snapshotSha256);
assert.equal(reviewContext({cwd:repo,base}).scope,'code-review-only');
assert.equal(reviewContext({cwd:repo,base:'--output=owned'}).status,'incomplete');
assert.equal(reviewContext({cwd:repo,base:'missing-ref'}).status,'incomplete');
fs.writeFileSync(path.join(repo,'big.txt'),'x'.repeat(1024*1024+1));assert.equal(reviewContext({cwd:repo,base}).status,'incomplete');fs.unlinkSync(path.join(repo,'big.txt'));
git('update-index','--assume-unchanged','tracked.txt');assert.equal(reviewContext({cwd:repo,base}).status,'incomplete');git('update-index','--no-assume-unchanged','tracked.txt');
fs.writeFileSync(path.join(repo,'binary.bin'),Buffer.from([0,1,2,255]));assert.ok(reviewContext({cwd:repo,base}).diff.includes('GIT binary patch'));fs.unlinkSync(path.join(repo,'binary.bin'));
if(process.platform!=='win32'){
  const outside=path.join(temp,'outside.txt');fs.writeFileSync(outside,'OUTSIDE_CONTENT_SENTINEL');fs.symlinkSync(outside,path.join(repo,'link'));
  const linked=reviewContext({cwd:repo,base});assert.equal(linked.status,'captured');assert.ok(!linked.diff.includes('OUTSIDE_CONTENT_SENTINEL'));fs.unlinkSync(path.join(repo,'link'));
}
// Boundary regressions use isolated repositories and inspect the entire result.
const marker='FORBIDDEN_REVIEW_BOUNDARY_SENTINEL';
const deniedRules=[{permission:'read',pattern:'*',action:'allow'},{permission:'read',pattern:'private/**',action:'deny'}];
const boundaryRepo=path.join(temp,'boundary');fs.mkdirSync(boundaryRepo);
const bgit=(...args)=>{const r=spawnSync('git',args,{cwd:boundaryRepo,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const commit=()=>{bgit('add','.');bgit('-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','-qm','fixture');};
bgit('init','-q');fs.mkdirSync(path.join(boundaryRepo,'private'));
const original=Array.from({length:30},(_,i)=>`unchanged ${i}`).join('\n')+'\n'+marker+'\n';
fs.writeFileSync(path.join(boundaryRepo,'private/source.txt'),original);commit();
const boundaryBase=bgit('rev-parse','HEAD');
bgit('mv','private/source.txt','public.txt');fs.writeFileSync(path.join(boundaryRepo,'public.txt'),original.replace(marker+'\n',''));bgit('add','.');
assert.match(bgit('diff','--name-status','-M',boundaryBase),/^R/);
const boundaryCapture=options=>capture({cwd:boundaryRepo,base:boundaryBase,permissionRules:deniedRules,...options});
const withheld=result=>{assert.equal(result.status,'incomplete',JSON.stringify(result));assert.equal(result.task,undefined);assert.equal(result.diff,undefined);assert.ok(!JSON.stringify(result).includes(marker));};
withheld(boundaryCapture());
withheld(boundaryCapture({permissionRules:deniedRules.map(r=>r.action==='deny'?{...r,action:'ask'}:r)}));
const allowed=boundaryCapture({permissionRules:[deniedRules[0]]});assert.equal(allowed.status,'captured');assert.ok(allowed.diff.includes('-'+marker));assert.ok(allowed.diff.includes('rename from private/source.txt'));
// Commit the permitted rename before testing task paths independently.
commit();
fs.mkdirSync(path.join(boundaryRepo,'private'),{recursive:true});
const secretTask=path.join(boundaryRepo,'private/task.txt');fs.writeFileSync(secretTask,marker);commit();
const cleanBase=bgit('rev-parse','HEAD');
withheld(boundaryCapture({base:cleanBase,taskFile:secretTask}));
const explicitTaskAllow=boundaryCapture({base:cleanBase,taskFile:secretTask,permissionRules:[
 {permission:'read',pattern:'*',action:'ask'},
 ...new Set([secretTask,fs.realpathSync(secretTask)])].map(rule=>typeof rule==='string'?{permission:'read',pattern:rule,action:'allow'}:rule)});
assert.equal(explicitTaskAllow.status,'captured');assert.equal(explicitTaskAllow.task,marker);
if(process.platform!=='win32'){
 const fileLink=path.join(temp,'task-link.txt');fs.symlinkSync(secretTask,fileLink);
 withheld(boundaryCapture({base:cleanBase,taskFile:fileLink}));
 const dirLink=path.join(temp,'task-parent');fs.symlinkSync(path.dirname(secretTask),dirLink);
 withheld(boundaryCapture({base:cleanBase,taskFile:path.join(dirLink,'task.txt')}));
 const allowedTask=boundaryCapture({base:cleanBase,taskFile:fileLink,permissionRules:[deniedRules[0]]});assert.equal(allowedTask.status,'captured');assert.equal(allowedTask.task,marker);
}
fs.writeFileSync(path.join(boundaryRepo,'README.md'),'v1.0.0-dirty\n');
assert.equal(boundaryCapture({base:cleanBase}).status,'captured');
// A real local submodule: no network, and no inference from arbitrary diff text.
const subSource=path.join(temp,'sub-source');fs.mkdirSync(subSource);
for(const args of [['init','-q'],['-c','core.hooksPath=/dev/null','-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','base']]){const r=spawnSync('git',args,{cwd:subSource,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
bgit('-c','protocol.file.allow=always','submodule','add',subSource,'module');commit();
const subBase=bgit('rev-parse','HEAD');assert.equal(boundaryCapture({base:subBase}).status,'captured');
fs.writeFileSync(path.join(boundaryRepo,'module/dirty.txt'),marker);
withheld(boundaryCapture({base:subBase}));
const output=path.join(temp,'bundle');materializeNativeTemplate({repositoryRoot:root,outputDirectory:output,review:true});
const config=JSON.parse(fs.readFileSync(path.join(output,'opencode.json')));
assert.deepEqual(fs.readdirSync(output).sort(),['core.md','opencode.json','review-context.mjs']);
assert.equal(config.command['harness-review'].subtask,false);assert.equal(config.agent['harness-reviewer'].mode,'primary');
assert.equal(config.agent['harness-reviewer'].permission.bash,'deny');
for(const key of ['model','small_model','default_agent','plugin','permission'])assert.equal(config[key],undefined);
assert.equal(config.agent['harness-reviewer'].model,undefined);assert.equal(config.command['harness-review'].model,undefined);
const role=fs.readFileSync(path.join(root,'agents/core-reviewer.md'),'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');
assert.ok(config.agent['harness-reviewer'].prompt.startsWith(role));
assert.equal(fs.readFileSync(path.join(output,'core.md'),'utf8'),fs.readFileSync(path.join(root,'profiles/native/core.md'),'utf8'));
assert.ok(!/assurance|quality_\*|oc_learning_\*/.test(JSON.stringify(config)));
const script=path.join(root,'scripts/profile-materialize.mjs');const denied=spawnSync(process.execPath,[script,'--review','--profile','core','--output',path.join(temp,'refused')],{encoding:'utf8'});assert.equal(denied.status,1);
const cliBundle=path.join(temp,'cli-review');
const installed=spawnSync(process.execPath,[script,'--native','--review','--profile','core','--output',cliBundle],{encoding:'utf8'});assert.equal(installed.status,0,installed.stderr);
assert.equal(JSON.parse(fs.readFileSync(path.join(cliBundle,'opencode.json'))).command['harness-review'].agent,'harness-reviewer');
console.log(JSON.stringify({passed:true,checks:['opt-in materialization','original role reused without legacy permissions','explicit base and task','tracked and new file diff','ignored files excluded','snapshot invalidated by edits','index/worktree unchanged','missing/oversized input incomplete','no model/default/plugin/repair','rename source/destination permissions','direct and symlink task permissions','README dirty suffix accepted; real dirty submodule refused'],providerRequests:0}));
