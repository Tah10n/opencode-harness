// The single final campaign. Per-arm attempt files prevent accidental resubmission
// within this one run directory; there is no global no-repeat infrastructure.
import fs from 'node:fs';import path from 'node:path';
import {readCorpus,requireCompleteCorpus,canonical,hash,fileDigests,materializeTask,root} from './inputs.mjs';
import {installedRuntime,plainArm,harnessArm,isolationState} from './arms.mjs';
import {analyze} from './statistics.mjs';
import {prepareGrader,classifyCheck} from './grading.mjs';
import {accountArm} from './accounting.mjs';
const [manifestFile,installed,archive,output]=process.argv.slice(2);
if(![manifestFile,installed,archive,output].every(Boolean))throw Error('Usage: run.mjs frozen-manifest installed-package archive private-output-directory');
const manifestBytes=fs.readFileSync(manifestFile),manifest=JSON.parse(manifestBytes);
if(manifest.version!==1||manifest.purpose!=='single-final-evaluation'||manifest.retry!=='none'||manifest.analysis!=='paired-cluster-t-20x3'||manifest.budgets?.draftMs!==300000||manifest.budgets?.extraMs!==600000||manifest.model!=='openai/gpt-5.6-luna'||manifest.variant!=='low')throw Error('MANIFEST_UNSUPPORTED');
if(hash(fs.readFileSync(archive))!==manifest.bundleSha256)throw Error('BUNDLE_CHANGED');
const installedFiles=fileDigests(path.resolve(installed));
if(canonical(installedFiles)!==canonical(manifest.runtimeFiles))throw Error('INSTALLED_RUNTIME_CHANGED');
for(const [file,digest] of Object.entries(manifest.runnerFiles)){if(hash(fs.readFileSync(path.join(root,'evals/verified-change',file)))!==digest)throw Error('RUNNER_CHANGED: '+file);}
const tasks=await readCorpus();requireCompleteCorpus(tasks);
if(manifest.tasks.length!==tasks.length)throw Error('TASK_SET_CHANGED');
for(const [i,task] of tasks.entries()){const frozen=manifest.tasks[i];if(task.id!==frozen.id||hash(canonical(task))!==frozen.definitionSha256||!['BC','CB'].includes(frozen.order.join('')))throw Error('TASK_CHANGED');}
if(manifest.tasks.filter(t=>t.order.join('')==='BC').length!==30)throw Error('ARM_ORDER_UNBALANCED');
const runtime=await installedRuntime(path.resolve(installed));
if(await runtime.resolveImage(manifest.image)!==manifest.image)throw Error('RUNTIME_IMAGE_CHANGED');
fs.mkdirSync(output,{recursive:true,mode:0o700});fs.chmodSync(output,0o700);
const runFile=path.join(output,'run.json'),manifestHash=hash(manifestBytes);
if(fs.existsSync(runFile)){if(JSON.parse(fs.readFileSync(runFile,'utf8')).manifestHash!==manifestHash)throw Error('RUN_DIRECTORY_MANIFEST_MISMATCH');}
else fs.writeFileSync(runFile,JSON.stringify({manifestHash,startedAt:new Date().toISOString()}),{flag:'wx',mode:0o600});
const lock=path.join(output,'active.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid}),{flag:'wx',mode:0o600});
const abort=new AbortController(),cancel=()=>abort.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
const save=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
const journal=event=>fs.appendFileSync(path.join(output,'attempts.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n',{mode:0o600});
async function attempt(directory,arm,action){const finished=path.join(directory,arm+'.json'),started=path.join(directory,arm+'.started.json');if(fs.existsSync(finished))return JSON.parse(fs.readFileSync(finished,'utf8'));if(fs.existsSync(started)){const result={status:'infrastructure_error',error:'UNRESOLVED_PRIOR_ATTEMPT_NO_RETRY'};save(finished,result);return result;}save(started,{at:new Date().toISOString()});journal({task:path.basename(directory),arm,phase:'arm_started'});console.log(JSON.stringify({task:path.basename(directory),arm,phase:'arm_started'}));let result;try{result=await action();}catch(error){result={status:'infrastructure_error',error:error.message};}save(finished,result);journal({task:path.basename(directory),arm,phase:'arm_finished',status:result.status,elapsedMs:result.elapsedMs});console.log(JSON.stringify({task:path.basename(directory),arm,phase:'arm_finished',status:result.status,elapsedMs:result.elapsedMs}));return result;}
async function grade(task,original,arm,directory,label){const file=path.join(directory,label+'-grade.json');if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));const started=path.join(directory,label+'-grade.started.json');if(fs.existsSync(started)){const missing={success:0,reason:'UNRESOLVED_PRIOR_GRADING_NO_RETRY',gradingAvailable:false};save(file,missing);return missing;}save(started,{at:new Date().toISOString()});let result;
 try{if(arm.status!=='completed'||!arm.snapshot){result={success:0,reason:arm.status,gradingAvailable:true};}
 else if(runtime.treeFingerprint(arm.snapshot.directory)!==arm.snapshot.fingerprint){result={success:0,reason:'snapshot_changed',gradingAvailable:false,isolationViolation:true};}
 else {const scope=runtime.checkScope(arm.snapshot,original.workspace,['src']);if(!scope.passed)result={success:0,reason:'scope_violation',scope,gradingAvailable:true};else{
  let grader;try{grader=prepareGrader(directory,task.hidden);}catch(error){result={success:0,reason:error.message,gradingAvailable:false,isolationViolation:true};save(file,result);return result;}
  const publicResult=await runtime.runCheck({id:'public',kind:'node-test',files:['test/public.test.mjs']},{image:manifest.image,workspace:arm.snapshot.directory},abort.signal);
  save(path.join(directory,label+'-public-check.json'),publicResult);
  const hiddenResult=await runtime.runCheck({id:'hidden',kind:'node-test',files:['hidden.test.mjs']},{image:manifest.image,workspace:arm.snapshot.directory,checkRoot:'/grader',extraMounts:[{source:grader,target:'/grader'}]},abort.signal);
  save(path.join(directory,label+'-hidden-check.json'),hiddenResult);
  const checks=[publicResult,hiddenResult],interpretations=checks.map(classifyCheck),available=interpretations.every(c=>c.available);result={success:Number(interpretations.every(c=>c.success)),reason:available?'graded':'grading_infrastructure',gradingAvailable:available,scope,checks,interpretations,graderSha256:hash(task.hidden)};
 }}}catch(error){result={success:0,reason:'grading_exception',error:error.message,gradingAvailable:false,isolationViolation:!isolationState(error.message)};}save(file,result);return result;}
try{
 for(const [i,task] of tasks.entries()){
  if(abort.signal.aborted)break;
  const directory=path.join(output,task.id);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const done=path.join(directory,'result.json');if(fs.existsSync(done))continue;
  const originalFile=path.join(directory,'original.json');let original;
  if(fs.existsSync(originalFile))original=JSON.parse(fs.readFileSync(originalFile,'utf8'));
  else {original=await runtime.inspectWorkspace(materializeTask(task,manifest.image));save(originalFile,original);}
  journal({task:task.id,phase:'task_started'});console.log(JSON.stringify({task:task.id,index:i+1,phase:'started'}));
  const common={original,task:task.task,image:manifest.image,model:manifest.model,variant:manifest.variant,signal:abort.signal};
  const A=await attempt(directory,'A',()=>plainArm(runtime,{...common,budgetMs:manifest.budgets.draftMs}));
  const arms={A};
  for(const label of manifest.tasks[i].order){
   if(abort.signal.aborted)break;
   arms[label]=await attempt(directory,label,()=>A.status!=='completed'||!A.snapshot?Promise.resolve({status:'upstream_draft_unavailable'}):label==='B'?plainArm(runtime,{...common,budgetMs:manifest.budgets.extraMs,initialSnapshot:A.snapshot}):harnessArm(runtime,{...common,budgetMs:manifest.budgets.extraMs,initialSnapshot:A.snapshot}));
  }
  if(abort.signal.aborted)break;
  const grades={};for(const label of ['A','B','C'])grades[label]=await grade(task,original,arms[label],directory,label);
  const sourceUnchanged=await runtime.inspectWorkspace(original.workspace).then(current=>current.head===original.head).catch(()=>false);
  const result={id:task.id,family:task.family,stratum:task.stratum,order:manifest.tasks[i].order,A:grades.A.success,B:grades.B.success,C:grades.C.success,
   grades,accounting:Object.fromEntries(Object.entries(arms).map(([label,arm])=>[label,accountArm(arm)])),armFiles:Object.fromEntries(['A','B','C'].map(label=>[label,path.join(directory,label+'.json')])),sourceUnchanged,
   isolationVerified:!Object.values(arms).some(a=>a.isolationVerified===false||a.status==='isolation_violation'||!isolationState(a.error))&&!Object.values(grades).some(g=>g.isolationViolation),gradingComplete:Object.values(grades).every(g=>g.gradingAvailable)};
  save(done,result);journal({task:task.id,phase:'task_finished',A:result.A,B:result.B,C:result.C});console.log(JSON.stringify({task:task.id,A:result.A,B:result.B,C:result.C,gradingComplete:result.gradingComplete}));
 }
 const rows=tasks.map(task=>path.join(output,task.id,'result.json')).filter(file=>fs.existsSync(file)).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
 if(rows.length===60){const result={manifestHash,rows,analysis:analyze(rows,{isolationVerified:rows.every(r=>r.isolationVerified),gradingComplete:rows.every(r=>r.gradingComplete),userWorktreeIntact:rows.every(r=>r.sourceUnchanged)})};if(!fs.existsSync(path.join(output,'results.json')))save(path.join(output,'results.json'),result);console.log(JSON.stringify({phase:'complete',output,analysis:result.analysis}));}
 else {console.log(JSON.stringify({phase:'incomplete',completed:rows.length,output}));process.exitCode=2;}
}finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);fs.unlinkSync(lock);}
