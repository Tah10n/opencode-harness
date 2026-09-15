// Extract ordinary author-only patches after verified terminal application.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.argv[2]),pub=path.resolve('development/native-task-sensitivity/targeted-20260914'),f=JSON.parse(fs.readFileSync(root+'/freeze.json'));
for(const a of f.attempts){
 const checks=root+'/checks/'+a.task+'-'+a.arm;if(!fs.existsSync(checks+'/verification.json'))continue;
 const copy=checks+'/author-delta-copy';if(fs.existsSync(copy))throw Error('Do not replace author delta');
 fs.cpSync(root+'/freeze-check-'+a.task,copy,{recursive:true,filter:p=>!path.relative(root+'/freeze-check-'+a.task,p).split(path.sep).includes('.git')});
 const git=args=>execFileSync('git',args,{cwd:copy,encoding:'utf8',maxBuffer:32*1024*1024});
 git(['init','-q']);git(['add','--all']);git(['-c','user.name=Offline evaluator','-c','user.email=evaluator@localhost','-c','commit.gpgsign=false','commit','-qm','Frozen seeded input']);
 const final=checks+'/ordinary-git-copy',verification=JSON.parse(fs.readFileSync(checks+'/verification.json'));
 for(const item of verification.changedFromSeed){const deleted=item.endsWith(' (deleted)'),name=deleted?item.slice(0,-10):item;if(deleted)fs.unlinkSync(copy+'/'+name);else{fs.mkdirSync(path.dirname(copy+'/'+name),{recursive:true});fs.copyFileSync(final+'/'+name,copy+'/'+name);fs.chmodSync(copy+'/'+name,fs.statSync(final+'/'+name).mode&0o777);}}
 git(['add','--all']);const patch=git(['diff','--cached','--binary']);fs.mkdirSync(pub+'/patches',{recursive:true});fs.writeFileSync(pub+'/patches/'+a.task+'-author.patch',patch);console.log(JSON.stringify({case:a.task,changedFromSeed:verification.changedFromSeed,bytes:Buffer.byteLength(patch)}));
}
