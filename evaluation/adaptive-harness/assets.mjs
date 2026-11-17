// Reuse the existing pinned plain dependencies; no product materialization or core.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function assets(output,linuxBin) {
  if(![output,linuxBin].every(path.isAbsolute)||fs.existsSync(output))throw Error('Fresh absolute output and pinned Linux binary required');
  const image=process.env.EVALUATION_IMAGE;
  if(!/^sha256:[a-f0-9]{64}$/.test(image??''))throw Error('Immutable image required');
  const plain=path.join(output,'plain');fs.mkdirSync(plain,{recursive:true});
  for(const name of ['package.json','package-lock.json'])fs.copyFileSync(fileURLToPath(new URL('../feedback-development/fixture-dependencies/'+name,import.meta.url)),path.join(plain,name));
  execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund','--prefix',plain,'--cache',path.join(output,'npm-cache')],{stdio:'inherit'});
  fs.writeFileSync(path.join(plain,'rg'),execFileSync('docker',['run','--rm','--network','none','--read-only','--user','node',image,'cat','/usr/bin/rg'],{maxBuffer:16*1024*1024,timeout:30000}),{mode:0o755});
  const bin=path.join(output,'toolchain/package/bin');fs.mkdirSync(bin,{recursive:true});fs.copyFileSync(linuxBin,path.join(bin,'opencode'));fs.chmodSync(path.join(bin,'opencode'),0o755);
  // The cache is disposable installation data, not part of the runtime.
  fs.rmSync(path.join(output,'npm-cache'),{recursive:true,force:true});
}
if(process.argv[1]===fileURLToPath(import.meta.url))assets(...process.argv.slice(2));
