// Preparation only; never invokes a launcher or reads authorization.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {manifest} from '../native-task-integrated/run.mjs';
const root=path.resolve('local/ledger-review-delivery'),dev='development/ledger-review-delivery';
const hash=b=>createHash('sha256').update(b).digest('hex');
const get=p=>JSON.parse(fs.readFileSync(p));
const save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),'f98a96121e5c4d340f3c674920c57e1cb80258e5');
assert.ok(!fs.existsSync(root+'/prepared.json'));
const old=get('local/plain-ledger-native-high/prepared.json');
const task=fs.readFileSync('development/plain-ledger-native-high/original-task.txt');
const environment=fs.readFileSync('development/plain-ledger-native-high/environment.txt');
assert.equal(hash(task),'c855e75f5b4705f703f5c4c39e01d05c73505854c32a4ff97dd5d564e82573eb');
assert.equal(hash(environment),'aa0afe37ca2ec1f3564642a02842d71472b72b88225069be22a4cbbe8fb114cc');
const archive=path.resolve('local/plain-ledger-native-high/baseline.tar');
assert.equal(hash(fs.readFileSync(archive)),'ea549fcc30d8facef77af8ebebc280910a24537e44ad8c6cfcbdc4888b5dcab1');
const source=root+'/baseline';if(!fs.existsSync(source)){fs.mkdirSync(source);execFileSync('tar',['-xf',archive,'-C',source]);}
assert.deepEqual(manifest(source),manifest(path.resolve('local/plain-ledger-native-high/baseline')));
assert.ok(!fs.existsSync(source+'/.git'));
const bundles={};
for(const role of ['author','reviewer']){
 const bundle=root+'/'+role+'-bundle';
 if(!fs.existsSync(bundle))execFileSync(process.execPath,['scripts/profile-materialize.mjs','--native','--profile','core',role==='author'?'--task':'--review','--output',bundle]);
 const config=get(bundle+'/opencode.json');config.instructions=['/template/core.md'];
 if(role==='author')config.plugin=['file:///template/native-task-plugin.mjs'];
 else {
  const from=Buffer.from('file://'+bundle+'/review-context.mjs').toString('base64');
  assert.ok(config.command['harness-review'].template.includes(from)||config.command['harness-review'].template.includes(Buffer.from('file:///template/review-context.mjs').toString('base64')));
  config.command['harness-review'].template=config.command['harness-review'].template.replace(from,Buffer.from('file:///template/review-context.mjs').toString('base64'));
 }
 fs.writeFileSync(bundle+'/opencode.json',JSON.stringify(config,null,2)+'\n');
 for(const n of ['node_modules','package.json','package-lock.json','rg'])if(!fs.existsSync(bundle+'/'+n))fs.cpSync(old.dependencies+'/'+n,bundle+'/'+n,{recursive:true,verbatimSymlinks:true});
 const ignore='node_modules\npackage.json\npackage-lock.json\n';
 if(fs.existsSync(bundle+'/.gitignore'))assert.equal(fs.readFileSync(bundle+'/.gitignore','utf8'),ignore);
 else fs.writeFileSync(bundle+'/.gitignore',ignore,{flag:'wx'});
 bundles[role]={path:bundle,sha256:hash(JSON.stringify(manifest(bundle)))};
}
const authorConfig=structuredClone(old.config);
authorConfig.permission.webfetch='deny';
const reviewerConfig=structuredClone(authorConfig);
const reviewPermissions={'*':'deny',read:'allow',glob:'allow',grep:'allow',skill:'deny'};
reviewerConfig.permission=reviewPermissions;
reviewerConfig.agent={'harness-reviewer':{permission:reviewPermissions}};
save(root+'/author-config.json',authorConfig);save(root+'/reviewer-config.json',reviewerConfig);
const prepared={status:'preparation_only_not_admitted',runtime:'f98a96121e5c4d340f3c674920c57e1cb80258e5',baseline:'2b16b6a8ad75b6b852adc5e2189e6d4a8d93eabd',
 taskSha256:hash(task),environmentSha256:hash(environment),baselineArchiveSha256:hash(fs.readFileSync(archive)),baselineTreeSha256:hash(JSON.stringify(manifest(source))),
 bundles,configHashes:{author:hash(fs.readFileSync(root+'/author-config.json')),reviewer:hash(fs.readFileSync(root+'/reviewer-config.json'))},
 image:old.image,toolchain:old.toolchain,model:old.model,variant:old.variant,exactReviewerInventory:'NOT RUN',
 optionalAugmentations:false,fullChainPreflight:'not_started',freezeCommit:null,deadlineStarted:false,realProviderRequests:0};
save(root+'/prepared.json',prepared);
const safe=structuredClone(prepared);delete safe.toolchain;
for(const role of Object.keys(safe.bundles))delete safe.bundles[role].path;
save(dev+'/preparation.json',safe);
console.log(JSON.stringify(safe));
