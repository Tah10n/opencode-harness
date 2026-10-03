// Prepare a genuine native bundle with the pinned dependency lock, no inference.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';
import {command,repository,directory} from './suite.mjs';
import {manifest} from '../support/manifest.mjs';
export function portableConfig(config) {
  return {...config,instructions:['/template/core.md'],plugin:['file:///template/native-task-plugin.mjs']};
}
export function validateBundle(bundle) {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-bundle-'));
  try {
    const expected=path.join(temp,'native');materializeNativeTemplate({repositoryRoot:repository,outputDirectory:expected,task:true});
    for(const file of fs.readdirSync(expected).filter(f=>f.endsWith('.mjs')||f==='core.md'))
      if(!fs.readFileSync(path.join(expected,file)).equals(fs.readFileSync(path.join(bundle,file))))throw Error('Bundle is not the unchanged native runtime: '+file);
    const config=JSON.parse(fs.readFileSync(path.join(expected,'opencode.json')));
    if(JSON.stringify(portableConfig(config))!==JSON.stringify(JSON.parse(fs.readFileSync(path.join(bundle,'opencode.json')))))throw Error('Unexpected bundle configuration/intervention');
    if(!fs.readFileSync(path.join(expected,'package.json')).equals(fs.readFileSync(path.join(bundle,'package.json'))))throw Error('Unpinned bundle package');
    if(!fs.readFileSync(path.join(directory,'fixture-dependencies/package-lock.json')).equals(fs.readFileSync(path.join(bundle,'package-lock.json'))))throw Error('Unpinned bundle dependency lock');
    const expectedFiles=new Set([...Object.keys(manifest(expected)),'package-lock.json','rg']);
    for(const name of Object.keys(manifest(bundle)))if(!name.startsWith('node_modules/')&&!expectedFiles.has(name))throw Error('Extra bundle/context file: '+name);
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
export function assets({output,linuxBin,executionImage}) {
  if(![output,linuxBin].every(p=>typeof p==='string'&&path.isAbsolute(p))||!/^sha256:[a-f0-9]{64}$/.test(executionImage??''))throw Error('Absolute fresh output, Linux OpenCode binary and immutable image required');
  if(fs.existsSync(output))throw Error('Assets already exist');
  fs.mkdirSync(output,{recursive:true,mode:0o700});
  const bundle=path.join(output,'bundle'),toolchain=path.join(output,'toolchain');
  materializeNativeTemplate({repositoryRoot:repository,outputDirectory:bundle,task:true});
  fs.copyFileSync(path.join(directory,'fixture-dependencies/package-lock.json'),path.join(bundle,'package-lock.json'));
  command('npm',['ci','--ignore-scripts','--no-audit','--no-fund','--prefix',bundle,'--cache',path.join(output,'npm-cache')],repository,{timeout:120000});
  fs.writeFileSync(path.join(bundle,'opencode.json'),JSON.stringify(portableConfig(JSON.parse(fs.readFileSync(path.join(bundle,'opencode.json')))),null,2)+'\n');
  const rg=command('docker',['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','node',executionImage,'cat','/usr/bin/rg'],repository,{encoding:null});
  fs.writeFileSync(path.join(bundle,'rg'),rg,{mode:0o755});
  fs.mkdirSync(path.join(toolchain,'package/bin'),{recursive:true});fs.copyFileSync(linuxBin,path.join(toolchain,'package/bin/opencode'));fs.chmodSync(path.join(toolchain,'package/bin/opencode'),0o755);
  const accessible=dir=>{fs.chmodSync(dir,0o755);for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())accessible(p);else if(e.isFile())fs.chmodSync(p,fs.statSync(p).mode|0o444);}};accessible(bundle);
  validateBundle(bundle);return {bundle,toolchain};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [output,linuxBin]=process.argv.slice(2);console.log(JSON.stringify(assets({output,linuxBin,executionImage:process.env.EVALUATION_IMAGE})));
}
