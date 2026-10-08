// Installed historical-config counterexample; the unchanged scheduler refuses it.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {prepare} from './prepare.mjs';
import {runTask} from './run.mjs';
import {runComparison} from '../support/scheduler.mjs';
import {startContainer} from '../support/container-session.mjs';
import {stopWorkload} from '../support/stop-workload.mjs';
import {captureCandidate} from '../polybench/capture.mjs';
import {command,directory} from './suite.mjs';
import {privateJSON,hashFile} from '../support/output-files.mjs';
import {fileURLToPath} from 'node:url';

export async function verifyTitle({output,bundle,toolchain,executionImage}) {
  const f=prepare({output,bundle,toolchain,executionImage,fixture:true,model:'openai/gpt-5.6-luna',variant:'high'});
  // Reconstruct the original configuration, before request formation.
  delete f.config.provider.openai.models['gpt-5.6-luna'].options;
  f.attempts=f.attempts.slice(0,1);privateJSON(output+'/freeze.json',f);
  let authReads=0,scriptedCalls=0;const frames=[];
  const outcome=await runComparison({root:output,readAuth:()=>{authReads++;throw Error('No credentials in title counterexample');},fetchImpl:()=>{scriptedCalls++;throw Error('Refused body must not reach transport');},startContainer:async options=>{
    const session=await startContainer({...options,onRequest:(frame,...args)=>{
      const body=frame.body;
      const title=(body.input??[]).some(item=>['developer','system'].includes(item.role)&&typeof item.content==='string'&&item.content.startsWith('You are a title generator.'));
      frames.push({stage:title?'title':'bootstrap',model:body.model,effort:body.reasoning?.effort});
      return options.onRequest(frame,...args);
    }});
    session.baseline=command('docker',['exec',session.name,'git','-C','/work/repo','rev-parse','HEAD'],output).trim();return session;
  },runTaskImplementation:runTask,stopWorkload,captureCandidate});
  assert.equal(outcome.pause?.kind,'boundary_refusal');assert.equal(authReads,0);assert.equal(scriptedCalls,0);
  assert.ok(frames.some(frame=>frame.stage==='title'&&frame.model==='gpt-5.6-luna'&&frame.effort==='none'));
  assert.ok(frames.some(frame=>frame.stage==='bootstrap'&&frame.model==='gpt-5.6-luna'&&frame.effort==='high'));
  const requests=JSON.parse(fs.readFileSync(output+'/runs/01-invoice-discount-direct/provider-metadata.json'));
  assert.ok(requests.every(r=>r.forwarded===false));
  const receipt={passed:true,modelFree:true,realProviderCalls:0,authReads,scriptedCalls,model:f.model,variant:f.variant,preparationSha256:hashFile(path.join(directory,'frozen-manifest.json')).sha256,outcome,frames,author:'not reached after boundary refusal',correction:'not reached after boundary refusal'};
  privateJSON(output+'/title-boundary.json',receipt);console.log(JSON.stringify(receipt));return receipt;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [output,bundle,toolchain]=process.argv.slice(2);
  if(![output,bundle,toolchain].every(p=>p&&path.isAbsolute(p)))throw Error('Absolute title output, bundle and toolchain required');
  await verifyTitle({output,bundle,toolchain,executionImage:process.env.EVALUATION_IMAGE});
}
