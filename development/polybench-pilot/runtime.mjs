// Install only the explicitly frozen runtime and already prepared dependencies.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve('local/polybench-pilot');
const candidate=root+'/runtime-checkout';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:candidate,encoding:'utf8'}).trim(),'e18db1fe10223db52dcc05b3e769bca140367c2b');
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:candidate,encoding:'utf8'}).trim(),'');
assert.ok(!fs.existsSync(root+'/bundle'));
const {materializeNativeTemplate}=await import(pathToFileURL(candidate+'/lib/native-template.mjs'));
materializeNativeTemplate({repositoryRoot:candidate,outputDirectory:root+'/bundle',task:true});
const cfg=JSON.parse(fs.readFileSync(root+'/bundle/opencode.json'));
cfg.instructions=['/template/core.md'];cfg.plugin=['file:///template/native-task-plugin.mjs'];
fs.writeFileSync(root+'/bundle/opencode.json',JSON.stringify(cfg,null,2));
for(const dest of ['bundle','plain-dependencies']){
 fs.mkdirSync(root+'/'+dest,{recursive:true});
 for(const name of ['node_modules','package.json','package-lock.json','rg'])
  fs.cpSync('local/native-task-integrated/plain-dependencies/'+name,root+'/'+dest+'/'+name,{recursive:true,verbatimSymlinks:true});
}
assert.equal(createHash('sha256').update(fs.readFileSync(root+'/bundle/node_modules/typescript/lib/typescript.js')).digest('hex'),'569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39');
assert.ok(!fs.existsSync(root+'/plain-dependencies/core.md'));
assert.ok(!fs.existsSync(root+'/plain-dependencies/opencode.json'));
const experiment=JSON.parse(fs.readFileSync('local/native-task-integrated/experiment-config.json'));
experiment.permission.external_directory={'*':'deny','/template/node_modules/typescript/lib/*':'allow','/diagnostic/*':'allow'};
fs.writeFileSync(root+'/experiment-config.json',JSON.stringify(experiment,null,2));
console.log('Frozen installed direct and plain dependencies prepared; provider requests: 0');
