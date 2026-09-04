import fs from 'node:fs';import {spawnSync} from 'node:child_process';
import {canonical,hash,fileDigests,root} from './inputs.mjs';
function command(program,args){const result=spawnSync(program,args,{cwd:root,maxBuffer:16*1024*1024,env:{PATH:process.env.PATH,HOME:process.env.HOME,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}});if(result.status!==0)throw Error('BUNDLE_INSPECTION_FAILED: '+result.stderr);return result.stdout;}
export function verifyBundle(installed,archive,candidate,sourceBytes=file=>command('git',['show',`${candidate}:product/verified-change/${file}`])){
 const listed=command('tar',['-tzf',archive]).toString().trim().split('\n');
 const files={};
 for(const name of listed){if(name.endsWith('/'))continue;if(!name.startsWith('package/')||name.split('/').some(p=>p==='..'||p==='.')||Object.hasOwn(files,name.slice(8)))throw Error('BUNDLE_ENTRY_INVALID');const file=name.slice(8);const bytes=command('tar',['-xOzf',archive,name]);files[file]=hash(bytes);if(files[file]!==hash(sourceBytes(file)))throw Error('BUNDLE_CANDIDATE_MISMATCH: '+file);}
 if(!files['lib/cli.mjs']||!files['package.json'])throw Error('BUNDLE_INCOMPLETE');
 if(canonical(files)!==canonical(fileDigests(installed)))throw Error('BUNDLE_INSTALL_MISMATCH');
 return {bundleSha256:hash(fs.readFileSync(archive)),runtimeFiles:files};
}
