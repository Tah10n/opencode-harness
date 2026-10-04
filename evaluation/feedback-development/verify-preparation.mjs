import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';
import {portableConfig,validateBundle} from './assets.mjs';
import {recoverRetained} from './recover-retained.mjs';
import {repository,directory} from './suite.mjs';

export function verifyPreparation(root) {
  fs.mkdirSync(root,{recursive:true});
  const bundle=path.join(root,'bundle');materializeNativeTemplate({repositoryRoot:repository,outputDirectory:bundle,task:true});
  fs.writeFileSync(bundle+'/opencode.json',JSON.stringify(portableConfig(JSON.parse(fs.readFileSync(bundle+'/opencode.json')))));
  fs.copyFileSync(directory+'/fixture-dependencies/package-lock.json',bundle+'/package-lock.json');
  const executionImage='sha256:'+'a'.repeat(64);
  assert.throws(()=>validateBundle(bundle,{executionImage}),/Missing executable bundle rg/);
  fs.writeFileSync(bundle+'/rg','fixture',{mode:0o644});assert.throws(()=>validateBundle(bundle,{executionImage}),/Missing executable bundle rg/);
  fs.chmodSync(bundle+'/rg',0o755);assert.throws(()=>validateBundle(bundle,{executionImage}),/ENOENT/);
  fs.mkdirSync(bundle+'/node_modules');fs.writeFileSync(bundle+'/node_modules/.package-lock.json','{"packages":{}}');
  assert.throws(()=>validateBundle(bundle,{executionImage}),/ENOENT/);
  const lock=JSON.parse(fs.readFileSync(bundle+'/package-lock.json'));
  fs.writeFileSync(bundle+'/node_modules/.package-lock.json',JSON.stringify(lock));
  for(const [name,entry] of Object.entries(lock.packages).filter(([name,entry])=>name&& !entry.optional)) {
    fs.mkdirSync(path.join(bundle,name),{recursive:true});fs.writeFileSync(path.join(bundle,name,'package.json'),JSON.stringify({version:entry.version}));
  }
  fs.writeFileSync(bundle+'/node_modules/typescript/package.json','{"version":"0.0.0"}');
  assert.throws(()=>validateBundle(bundle,{executionImage}),/Unpinned or missing installed dependency/);
  const bin=path.join(root,'bin');fs.mkdirSync(bin);
  // No real Docker call: reproduce unavailable inventory and failed existing recovery.
  fs.writeFileSync(bin+'/docker','#!/bin/sh\nif [ "$1" = ps ]; then\n  if [ "$FIXTURE_INVENTORY" = live ]; then printf \'%s\\n\' "{\\"ID\\":\\"$FIXTURE_ID\\",\\"Names\\":\\"$FIXTURE_NAME\\"}"; exit 0; fi\n  if [ "$FIXTURE_INVENTORY" = absent ]; then exit 0; fi\nfi\nexit 1\n',{mode:0o755});
  const out=path.join(root,'runs','fixture'),session=path.join(out,'session');fs.mkdirSync(session,{recursive:true});
  const name='template-dev-11111111-1111-1111-1111-111111111111',containerID='b'.repeat(64);
  const retained=JSON.stringify({name,containerID,relayPid:123,baseline:'c'.repeat(40),privateRecording:'MUST_NOT_UPLOAD'}),container=JSON.stringify({name,image:executionImage,argv:['PRIVATE_ARGUMENT']});
  fs.writeFileSync(session+'/retained-resource.json',retained);fs.writeFileSync(session+'/container.json',container);
  const original={PATH:process.env.PATH,FIXTURE_INVENTORY:process.env.FIXTURE_INVENTORY,FIXTURE_ID:process.env.FIXTURE_ID,FIXTURE_NAME:process.env.FIXTURE_NAME};
  const diagnostics=path.join(root,'safe.json');
  try {
    Object.assign(process.env,{PATH:bin+path.delimiter+process.env.PATH,FIXTURE_ID:containerID,FIXTURE_NAME:name});
    for(const state of ['unavailable','live']) {
      process.env.FIXTURE_INVENTORY=state;
      assert.throws(()=>recoverRetained([path.dirname(out)],diagnostics),/unrecovered/);
      assert.equal(fs.readFileSync(session+'/retained-resource.json','utf8'),retained);assert.equal(fs.readFileSync(session+'/container.json','utf8'),container);
      assert.doesNotMatch(fs.readFileSync(diagnostics,'utf8'),/MUST_NOT_UPLOAD|PRIVATE_ARGUMENT/);
    }
    process.env.FIXTURE_INVENTORY='absent';assert.equal(recoverRetained([path.dirname(out)],diagnostics).cleanupMayProceed,true);
  }finally{for(const [key,value] of Object.entries(original))if(value===undefined)delete process.env[key];else process.env[key]=value;}
  console.log('PASS missing rg/dependencies/versions and retained CI recovery failure/confirmed absence');
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-preparation-regression-'));
  try{verifyPreparation(root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
