// One local manifest; no signing/custody/global experiment registry.
import fs from 'node:fs';import path from 'node:path';import {readCorpus,requireCompleteCorpus,canonical,hash,fileDigests,git,root} from './inputs.mjs';import {installedRuntime} from './arms.mjs';
import {verifyBundle} from './bundle.mjs';
const [installed,archive,output]=process.argv.slice(2);if(!installed||!archive||!output)throw Error('Usage: freeze.mjs installed-package archive output-manifest');
const tasks=await readCorpus();requireCompleteCorpus(tasks); // Before any model/provider access.
if(git(['status','--porcelain']))throw Error('FREEZE_REQUIRES_CLEAN_CHECKOUT');
const runtime=await installedRuntime(path.resolve(installed));const image=await runtime.resolveImage('node:24.19.0-bookworm-slim');
const candidate='173a853c984044fc4543d05e5df2b18ee7135dfa'; // Product revision, not a model binding.
verifyBundle(path.resolve(installed),path.resolve(archive),candidate);
const manifest={version:1,purpose:'single-final-evaluation',createdAt:new Date().toISOString(),candidateCommit:candidate,runnerCommit:git(['rev-parse','HEAD']),bundleSha256:hash(fs.readFileSync(archive)),runtimeFiles:fileDigests(path.resolve(installed)),runnerFiles:fileDigests(path.join(root,'evals/verified-change')),image,model:'openai/gpt-5.6-luna',variant:'low',budgets:{draftMs:300000,extraMs:600000},retry:'none',analysis:'paired-cluster-t-20x3',tasks:tasks.map((task,index)=>({id:task.id,family:task.family,stratum:task.stratum,definitionSha256:hash(canonical(task)),order:index%2===0?['B','C']:['C','B']}))};
fs.writeFileSync(output,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({manifest:path.resolve(output),sha256:hash(fs.readFileSync(output)),tasks:tasks.length,freeze:'local manifest written; commit before running'}));
