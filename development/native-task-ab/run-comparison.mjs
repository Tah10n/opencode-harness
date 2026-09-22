// Frozen primary or conditional transfer comparison using the same managed-deadline scheduler.
// A/B do not add a phase or an intermediate model deadline.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {runTask} from './native-run.mjs';
import {prepareRecording,recordingProfile} from './provider-recording.mjs';
import {privateJSON} from '../native-output-retention/output-files.mjs';
import {recheckSavedAvailability} from '../native-task-investigation/availability-probe.mjs';
import {execFileSync} from 'node:child_process';
// Per-request observer for the response lifecycle forms actually emitted by
// the configured upstream. Transport/native completion remain separate facts.
export function responseObserver(record, persist=()=>{}, closeAdmission=()=>{}, observeEvent=()=>{}) {
 const decoder=new TextDecoder('utf-8',{fatal:true});let buffer='';
 const terminalTypes={'response.completed':'completed','response.failed':'failed','response.incomplete':'incomplete'};
 const stop=(kind,details={})=>{record.admissionStop??={kind,...details};persist();closeAdmission(record.admissionStop);};
 const conflict=reason=>{record.responseBindingError??=reason;record.serverCompletion='unknown';stop('provider_protocol_error',{reason});};
 const usageOf=u=>{if(!u||typeof u!=='object')return null;const out={};for(const key of ['input_tokens','output_tokens','total_tokens'])if(Number.isFinite(u[key])&&u[key]>=0)out[key]=u[key];if(Number.isFinite(u.input_tokens_details?.cached_tokens))out.cached_tokens=u.input_tokens_details.cached_tokens;if(Number.isFinite(u.output_tokens_details?.reasoning_tokens))out.reasoning_tokens=u.output_tokens_details.reasoning_tokens;return Object.keys(out).length?out:null;};
 const packet=text=>{
  const lines=text.split(/\r?\n/),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');if(!data||data==='[DONE]')return;
  let event;try{event=JSON.parse(data);}catch{conflict('Malformed upstream SSE JSON');return;}
  observeEvent(event,lines.find(l=>l.startsWith('event:'))?.slice(6).trim());
  if(event?.type==='error'||event?.type==='response.error'){
   record.protocolError=event.error??{code:event.code??null,message:event.message??null};
   record.serverCompletion=knownResponseTerminal(record)?record.terminalResponse.status:'unknown';
   stop('provider_protocol_error',{error:record.protocolError});return;
  }
  const lifecycle=['response.created','response.in_progress',...Object.keys(terminalTypes)].includes(event?.type);if(!lifecycle)return;
  const declared=lines.find(l=>l.startsWith('event:'))?.slice(6).trim();if(declared&&declared!==event.type){conflict('SSE event/type mismatch');return;}
  const r=event.response,status=terminalTypes[event.type]??'in_progress';
  if(!r||typeof r.id!=='string'||!r.id||r.status!==status){conflict('Unbound or inconsistent response lifecycle');return;}
  if(record.responseId&&record.responseId!==r.id){conflict('Different response IDs in one request');return;}
  if(!record.responseId){if(!['response.created','response.in_progress'].includes(event.type)){conflict('Terminal response without request-local lifecycle binding');return;}record.responseId=r.id;}
  if(!terminalTypes[event.type]){if(record.terminalResponse)conflict('Nonterminal lifecycle after terminal response');else record.responseStatus=r.status;return;}
  const usage=usageOf(r.usage),previous=record.terminalResponse;
  if(previous&&(previous.id!==r.id||previous.status!==r.status||JSON.stringify(previous.usage)!==JSON.stringify(usage))){conflict('Conflicting terminal response events');return;}
  if(!previous){record.terminalResponse={id:r.id,status:r.status,eventType:event.type,usage,...(r.error?{error:r.error}:{}),...(r.incomplete_details?{incompleteDetails:r.incomplete_details}:{})};record.responseStatus=r.status;record.usage=usage;record.terminalEvents=1;}
  else record.duplicateTerminalEvents=(record.duplicateTerminalEvents??0)+1;
  record.serverCompletion=record.responseBindingError?'unknown':r.status;persist();
  // This development-series admission rule does not alter provider knowledge or
  // the user's native OpenCode retry policy. Both statuses forbid another send.
  if(r.status==='failed'||r.status==='incomplete')stop('provider_'+r.status,{error:r.error??null,incompleteDetails:r.incomplete_details??null});
 };
 const consume=text=>{buffer+=text;let match;while((match=/\r?\n\r?\n/.exec(buffer))){packet(buffer.slice(0,match.index));buffer=buffer.slice(match.index+match[0].length);}};
 return {push(bytes){try{consume(decoder.decode(bytes,{stream:true}));}catch(error){conflict('Invalid upstream UTF-8');throw error;}},end(){try{consume(decoder.decode());if(buffer.trim())conflict('Unterminated upstream SSE event at EOF');}catch(error){conflict('Invalid upstream UTF-8 at EOF');throw error;}}};
}
export function knownResponseTerminal(record){return !!record.terminalResponse&&!record.responseBindingError;}

export async function runComparison({root,startContainer,captureCandidate,stopWorkload,readAuth,fetchImpl=fetch,runTaskImplementation=runTask,continuationFile=null,verifyQuiescence=verifyHistoricalContainers,beforeTasks=null}) {
const f=JSON.parse(fs.readFileSync(path.join(root,'freeze.json')));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const amendment=continuationFile?JSON.parse(fs.readFileSync(continuationFile)):null;
const repeatedContinuation=!!amendment&&f.experimentKind==='integrated-repeats';
const integrationContinuation=!!amendment&&f.experimentKind==='targeted-integration';
const availabilityContinuation=integrationContinuation&&amendment.firstSlot===3;
const savedAvailabilityContinuation=availabilityContinuation&&typeof amendment.savedProbeReportSha256==='string';
const firstSlot=repeatedContinuation?11:integrationContinuation?(availabilityContinuation?3:2):19,lastSlot=repeatedContinuation?12:integrationContinuation?9:48;
const outputRoot=amendment?path.join(root,savedAvailabilityContinuation?'continuation-3-9-rechecked':`continuation-${firstSlot}-${lastSlot}`):root;
const allowedChanges=repeatedContinuation
 ?[path.resolve('development/native-task-ab/run-comparison.mjs'),path.resolve('development/native-task-integrated/run.mjs')]
 :integrationContinuation
 ?[path.resolve('development/native-task-ab/run-comparison.mjs'),path.resolve('development/native-task-investigation/run.mjs')]
 :['run-comparison.mjs','run.mjs','verify-scheduler.mjs'].map(n=>path.resolve('development/native-task-ab',n));
if(amendment){
 if(amendment.version!==1||amendment.firstSlot!==firstSlot||amendment.lastSlot!==lastSlot||amendment.originalFreezeSha256!==sha(fs.readFileSync(path.join(root,'freeze.json')))||(!repeatedContinuation&&!integrationContinuation&&f.experimentKind!=='h00-transfer'))throw Error('Invalid explicit continuation amendment');
 const historicalPause=JSON.parse(fs.readFileSync(path.join(root,'scheduling-paused.json')));
 if(historicalPause.kind!=='unknown_submission'||historicalPause.slot!==(availabilityContinuation?1:firstSlot-1))throw Error('Amendment does not authorize this pause');
 if(availabilityContinuation){
  const previous=path.join(root,'continuation-2-9/scheduling-paused.json');
  for(const name of ['availability-probe.mjs','prepare-availability.mjs',...(savedAvailabilityContinuation?['prepare-probe-recheck.mjs']:[])])if(amendment.additionalLauncherFiles?.[name]!==sha(fs.readFileSync(path.resolve('development/native-task-investigation',name))))throw Error('Availability launcher version mismatch');
  if(amendment.previousPauseSha256!==sha(fs.readFileSync(previous))||JSON.parse(fs.readFileSync(previous)).slot!==2||amendment.availabilityRequests!==(savedAvailabilityContinuation?0:1)||(!savedAvailabilityContinuation&&typeof beforeTasks!=='function'))throw Error('Missing second pause or availability gate');
 }
 if(savedAvailabilityContinuation){
  const saved=recheckSavedAvailability(root,amendment.savedProbeReportSha256);
  if(!saved.success||amendment.savedProbePauseSha256!==saved.sourceHashes.pause)throw Error('Saved probe does not authorize continuation');
  const periods=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&e.name.startsWith('continuation-')).map(e=>e.name);
  if(periods.some(n=>!['continuation-2-9','continuation-3-9'].includes(n)))throw Error('Unexpected or already-started continuation period');
  if(fs.existsSync(path.join(root,'continuation-3-9/runs'))||fs.readdirSync(path.join(root,'continuation-3-9')).some(n=>/^(started|request-|provider-metadata)/.test(n)))throw Error('Probe period has task artifacts');
 }
 if((integrationContinuation||repeatedContinuation)&&amendment.runtimeSha!==f.runtimeSha)throw Error('Product candidate identity changed');
 if(amendment.originalPauseSha256!==sha(fs.readFileSync(path.join(root,'scheduling-paused.json'))))throw Error('Historical pause changed');
 if(!amendment.launcherFiles||!Object.keys(amendment.launcherFiles).length||Object.keys(amendment.launcherFiles).some(file=>!allowedChanges.includes(file)))throw Error('Amendment exceeds launcher scope');
 for(const [file,versions] of Object.entries(amendment.launcherFiles))if(versions.before!==f.files[file]||versions.after!==sha(fs.readFileSync(file)))throw Error('Amended launcher version mismatch');
}

function verify(){
 if(f.experimentKind!==undefined&&!['ledger-review-diagnostic','ledger-review-diagnostic-preflight','assertion-review-pair','assertion-review-pair-preflight','plain-ledger-native-high','plain-ledger-native-high-preflight','plain-mui-18141','plain-mui-18141-preflight','preservation-pair','preservation-pair-preflight','polybench-pilot','polybench-pilot-preflight','subscribe-offline','type-compat','command-hints','transfer','h00-transfer','sensitivity','sensitivity-usage','sensitivity-replay','sensitivity-targeted','targeted-integration','integrated-repeats'].includes(f.experimentKind))throw Error('Unknown development experiment');
 const diagnosticReview=['ledger-review-diagnostic','ledger-review-diagnostic-preflight'].includes(f.experimentKind);
 const diagnosticFixture=f.experimentKind==='ledger-review-diagnostic-preflight';
 const assertionPair=['assertion-review-pair','assertion-review-pair-preflight'].includes(f.experimentKind);
 const plainLedger=['plain-ledger-native-high','plain-ledger-native-high-preflight'].includes(f.experimentKind);
 const plainMui=['plain-mui-18141','plain-mui-18141-preflight'].includes(f.experimentKind);
 const preservationPair=['preservation-pair','preservation-pair-preflight'].includes(f.experimentKind);
 const polybench=f.experimentKind==='polybench-pilot', polybenchPreflight=f.experimentKind==='polybench-pilot-preflight';
 const subscribeRepeatability=f.experimentKind==='subscribe-offline'&&f.repeatability===true, subscribeOffline=f.experimentKind==='subscribe-offline', typeCompat=f.experimentKind==='type-compat', commandHints=f.experimentKind==='command-hints', transfer=f.experimentKind==='transfer', h00=f.experimentKind==='h00-transfer', sensitivity=f.experimentKind==='sensitivity', usage=f.experimentKind==='sensitivity-usage', replay=f.experimentKind==='sensitivity-replay', targeted=f.experimentKind==='sensitivity-targeted', integration=f.experimentKind==='targeted-integration';
 if(f.attempts.length!==(diagnosticReview?(diagnosticFixture?1:2):(plainMui||plainLedger)?1:(preservationPair||assertionPair)?2:polybenchPreflight?3:subscribeOffline?(subscribeRepeatability?4:2):(commandHints||typeCompat)?4:repeatedContinuation?12:integration?9:targeted?3:replay?4:usage?2:h00?48:transfer||sensitivity?8:30)||f.model!=='openai/gpt-5.6-luna'||f.variant!=='high'||f.budgetMs!==(diagnosticReview?600000:(plainMui||plainLedger||preservationPair||assertionPair||polybench||polybenchPreflight||subscribeOffline||commandHints||typeCompat||repeatedContinuation)?1800000:900000)||!f.preflightPassed)throw Error('Invalid development configuration');
 for(const [file,digest] of Object.entries(f.files))if(sha(fs.readFileSync(file))!==(amendment?.launcherFiles[file]?.after??digest))throw Error('Frozen file changed: '+file);
 for(const [directory,expected]of Object.entries(f.runtimeManifests??{})){const seen=new Set();const visit=(dir,prefix='')=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(repeatedContinuation&&entry.name==='.git')continue;const file=path.join(dir,entry.name),name=prefix+entry.name,stat=fs.lstatSync(file);if(stat.isDirectory()){visit(file,name+'/');continue;}const got=stat.isSymbolicLink()?{symlink:fs.readlinkSync(file)}:{sha256:sha(fs.readFileSync(file)),executable:!!(stat.mode&0o111)};if(JSON.stringify(got)!==JSON.stringify(expected[name]))throw Error('Installed runtime changed: '+name);seen.add(name);}};visit(directory);if(seen.size!==Object.keys(expected).length)throw Error('Installed runtime missing files');}
 const groups=new Map();for(const a of f.attempts){const group=groups.get(a.task)??[];group.push(a.arm);groups.set(a.task,group);}
 if(diagnosticReview){
  if(amendment||f.runtimeSha!=='ab7e6e1d153b996c577d96708c1e1fb84f57cbd3'||f.strategy!=='diagnostic-review'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||f.attempts.map(a=>a.task+':'+a.arm).join(',')!==(diagnosticFixture?'neutral-review:candidate-A':'account-switch-ledger:candidate-A,account-switch-ledger:candidate-B')||f.attempts.some(a=>a.project!==(diagnosticFixture?'local/neutral-review':'Tah10n/viberacing'))||new Set(f.attempts.map(a=>a.source)).size!==f.attempts.length)throw Error('Invalid two-slot diagnostic review assignment');
 }else if(assertionPair){
  if(amendment||f.runtimeSha!=='8facea83bec3203ed500ee6884278d2df06b8c2b'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||f.attempts.map(a=>a.task+':'+a.arm).join(',')!=='account-switch-ledger:AR0,account-switch-ledger:AR1'||f.attempts.some(a=>a.project!=='Tah10n/viberacing')||f.candidates?.AR0!=='ca72c444b06b3be096cfa22aa6a82968e807a994'||f.candidates?.AR1!==f.runtimeSha||!f.templates?.AR0||!f.templates?.AR1||f.templates.AR0===f.templates.AR1)throw Error('Invalid assertion-review pair');
 }else if(plainLedger){
  if(amendment||f.runtimeSha!=='e18db1fe10223db52dcc05b3e769bca140367c2b'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||f.attempts.length!==1||f.attempts[0].task!=='account-switch-ledger'||f.attempts[0].arm!=='P'||f.attempts[0].project!=='Tah10n/viberacing')throw Error('Invalid single plain ledger schedule');
 }else if(plainMui){
  if(amendment||f.runtimeSha!=='e18db1fe10223db52dcc05b3e769bca140367c2b'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||f.attempts.length!==1||f.attempts[0].task!=='mui__material-ui-18141'||f.attempts[0].arm!=='P'||f.attempts[0].project!=='mui/material-ui')throw Error('Invalid single plain MUI schedule');
 }else if(preservationPair){
  const revision2=f.preservationRevision===2;
  if((f.preservationRevision!==undefined&&!revision2)||amendment||f.runtimeSha!==(revision2?'829f78ee2ff5592046c5e18746fb154bd9941519':'fba1960cad4e2cf25831af1be8a21bea0361947d')||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||groups.size!==1||f.attempts.map(a=>a.task+':'+a.arm).join(',')!==(revision2?'sveltejs__svelte-1190:ON,sveltejs__svelte-1190:OFF':'sveltejs__svelte-1190:OFF,sveltejs__svelte-1190:ON')||f.attempts.some(a=>a.project!=='sveltejs/svelte')||new Set(f.attempts.map(a=>a.source)).size!==1)throw Error('Invalid preservation development pair');
 }else if(polybench||polybenchPreflight){
  const count=polybench?10:1;
  if(amendment||f.runtimeSha!=='e18db1fe10223db52dcc05b3e769bca140367c2b'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||groups.size!==count||f.attempts.length!==count*3)throw Error('Invalid PolyBench frozen schedule');
  let index=0;for(const arms of groups.values()){if(arms.join(',')!==['P,H0,H1','H0,H1,P','H1,P,H0'][index++%3])throw Error('Invalid PolyBench cyclic order');}
  if(polybench&&(new Set(f.attempts.map(a=>a.project)).size<4||f.budgetMs!==1800000))throw Error('Invalid PolyBench allocation');
 }else if(subscribeOffline){
  if(amendment||f.runtimeSha!=='e18db1fe10223db52dcc05b3e769bca140367c2b'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||(subscribeRepeatability?f.attempts.map(a=>[a.task,a.repetition,a.arm].join(':')).join(',')!=='A:1:ON,A:1:OFF,A:2:OFF,A:2:ON':f.attempts.map(a=>a.task+':'+a.arm).join(',')!=='A:OFF,A:ON')||groups.size!==1)throw Error('Invalid frozen offline subscribe pair');
 }else if(typeCompat){
  if(amendment||f.runtimeSha!=='8264ce42ef198580af834dcb09df996ac1274f1d'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||f.attempts.map(a=>a.task+':'+a.arm).join(',')!=='A:OFF,A:ON,B:ON,B:OFF'||groups.size!==2)throw Error('Invalid frozen type-compat comparison');
 }else if(commandHints){
  if(amendment||f.runtimeSha!=='c90fc7c78bcdd4d8288550b887f52990bafb11a6'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||f.config.permission.external_directory!=='allow'||f.attempts.map(a=>a.task+':'+a.arm).join(',')!=='A:OFF,A:ON,B:ON,B:OFF'||groups.size!==2||[...groups.values()].some(x=>x.slice().sort().join(',')!=='OFF,ON'))throw Error('Invalid frozen command-hints comparison');
 }else if(repeatedContinuation){
  if(f.runtimeSha!=='797ce6f1b75af217e00224d1b38790346dee1d19'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||f.attempts.slice(10).map(a=>[a.slot,a.task,a.repetition,a.arm].join(':')).join(',')!=='11:url-search-params:2:P,12:url-search-params:2:Hbase')throw Error('Invalid original final pair');
 }else if(integration){
  if(groups.size!==3||[...groups.values()].some(x=>x.slice().sort().join(',')!=='H,P,R')||f.attempts.map(a=>a.arm).join(',')!=='P,R,H,R,H,P,H,P,R'||new Set(f.attempts.map(a=>a.project)).size<2||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000)throw Error('Invalid frozen nine-run integration schedule');
 }else if(targeted){
  if(groups.size!==3||f.attempts.some(a=>a.arm!=='H1')||new Set(f.attempts.map(a=>a.source)).size!==3||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000)throw Error('Invalid three-run targeted sensitivity schedule');
 }else if(replay){
  if(groups.size!==2||[...groups.values()].some(x=>x.slice().sort().join(',')!=='S0,S1')||f.attempts.map(a=>a.arm).join(',')!=='S0,S1,S1,S0'||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000||!f.baselineTemplate)throw Error('Invalid four-run sensitivity replay schedule');
 }else if(usage){
  if(groups.size!==2||f.attempts.some(a=>a.arm!=='H1')||new Set(f.attempts.map(a=>a.source)).size!==2||f.strategy!=='direct'||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000)throw Error('Invalid two-run sensitivity usage schedule');
 }else if(sensitivity){
  if(groups.size!==4||[...groups.values()].some(x=>x.slice().sort().join(',')!=='H0,H1')||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000)throw Error('Invalid sensitivity diagnostic schedule');
 }else if(h00){
  if(groups.size!==12||f.streamLimit!=='remaining-task-budget'||f.connectionTimeoutMs!==30000)throw Error('Invalid H00 transfer settings');
  const projects=new Map();for(const task of groups.keys()){const rows=f.attempts.filter(a=>a.task===task),project=rows[0].project;if(!project||rows.some(a=>a.project!==project))throw Error('Invalid project group');projects.set(project,(projects.get(project)??0)+1);for(const repetition of [1,2])if(rows.filter(a=>a.repetition===repetition).map(a=>a.arm).sort().join(',')!=='H00,P')throw Error('Invalid H00 repeated pair');}
  if(projects.size<6||[...projects.values()].some(n=>n>2))throw Error('Invalid project diversity');
 }else if(transfer){
  if(!['H10','H01','H11'].includes(f.selectedH)||f.transferGatePassed!==true||groups.size!==2)throw Error('Invalid transfer gate or candidate');
  for(const task of groups.keys())for(const repetition of [1,2]){const pair=f.attempts.filter(a=>a.task===task&&a.repetition===repetition).map(a=>a.arm).sort();if(pair.join(',')!==[f.selectedH,'P'].sort().join(','))throw Error('Invalid transfer pair');}
 }else if(groups.size!==6||[...groups.values()].some(x=>x.slice().sort().join(',')!=='H00,H01,H10,H11,P'))throw Error('Invalid pair schedule');
 if(new Set(f.attempts.map(a=>a.slot)).size!==f.attempts.length||f.attempts.some((a,i)=>a.slot!==i+1))throw Error('Invalid slot identity');
}

verify();
if(amendment){
 if(repeatedContinuation&&fs.readdirSync(root,{withFileTypes:true}).some(e=>e.isDirectory()&&e.name.startsWith('continuation-')))throw Error('Continuation period already exists; no further continuation authorized');
 if(fs.existsSync(outputRoot))throw Error('Continuation directory already exists; never overwrite or automatically resume');
 const identity=(got,wanted)=>['slot','task','project','repetition','arm','source'].every(key=>got[key]===wanted[key]);
 const historical=[];
 const runName=a=>a.task+(a.repetition?'-r'+a.repetition:'')+'-'+a.arm;
 const expectedDirectories=new Set(f.attempts.filter(a=>a.slot<firstSlot).map(runName));
 const periodFor=a=>availabilityContinuation&&a.slot===2?'continuation-2-9/':'';
 const actualDirectories=fs.readdirSync(path.join(root,'runs'));
 if(availabilityContinuation)actualDirectories.push(...fs.readdirSync(path.join(root,'continuation-2-9/runs')));
 if(actualDirectories.length!==firstSlot-1||actualDirectories.some(n=>!expectedDirectories.has(n)))throw Error('Unrecognized historical run directory');
 for(const attempt of f.attempts){
  const dir=path.join(root,periodFor(attempt),'runs',runName(attempt));
  if(attempt.slot>=firstSlot){if(fs.existsSync(dir)||(availabilityContinuation&&fs.existsSync(path.join(root,'continuation-2-9/runs',runName(attempt)))))throw Error('Unstarted slot has historical artifacts: '+attempt.slot);continue;}
  const get=name=>JSON.parse(fs.readFileSync(path.join(dir,name)));
  for(const name of ['started.json','completed.json','result.json'])if(!identity(get(name),attempt))throw Error('Historical attempt identity mismatch: '+attempt.slot);
  const facts=get('stop-verification.json');
  if(!facts.terminationVerified||!facts.captureSaved||!facts.forwardingClosed||!facts.relayRemoved||facts.activeProviderHandlers!==0||get('session/cleanup.json').status!==0)throw Error('Historical stop unverified: '+attempt.slot);
  if(!fs.existsSync(path.join(dir,'candidate.tar'))||!Array.isArray(get('provider-metadata.json')))throw Error('Historical capture/accounting missing');
  if(integrationContinuation||repeatedContinuation){
   for(const name of ['started.json','completed.json','result.json','stop-verification.json','provider-metadata.json','candidate.tar','session/cleanup.json','session/container.json']){
    if(!amendment.historicalFiles?.[periodFor(attempt)+'runs/'+runName(attempt)+'/'+name])throw Error('Missing historical artifact hash: '+name);
   }
  }
  historical.push({slot:attempt.slot,container:get('session/container.json').name});
 }
 if(!amendment.historicalFiles||!Object.keys(amendment.historicalFiles).length)throw Error('Missing historical artifact preservation manifest');
 for(const [relative,digest] of Object.entries(amendment.historicalFiles)){
  const file=path.resolve(root,relative);if(!file.startsWith(path.resolve(root)+path.sep)||sha(fs.readFileSync(file))!==digest)throw Error('Historical artifact changed: '+relative);
 }
 await verifyQuiescence(historical);
 fs.mkdirSync(outputRoot,{mode:0o700});fs.writeFileSync(path.join(outputRoot,'admission.json'),JSON.stringify({originalFreezeSha256:amendment.originalFreezeSha256,amendmentSha256:sha(fs.readFileSync(continuationFile)),firstSlot,lastSlot,historicalStopsVerified:firstSlot-1,at:new Date().toISOString()},null,2),{flag:'wx'});
}else if(fs.existsSync(path.join(root,'scheduling-paused.json')))throw Error('Continuation paused; no automatic resume');

if(availabilityContinuation){
 const probe=savedAvailabilityContinuation?recheckSavedAvailability(root,amendment.savedProbeReportSha256):await beforeTasks(outputRoot);
 if(savedAvailabilityContinuation)fs.writeFileSync(path.join(outputRoot,'saved-probe-recheck.json'),JSON.stringify(probe,null,2),{flag:'wx'});
 if(probe?.success!==true){fs.writeFileSync(path.join(outputRoot,'scheduling-paused.json'),JSON.stringify({kind:'availability_not_confirmed',probe:probe??null},null,2),{flag:'wx'});return {status:'paused',pause:{kind:'availability_not_confirmed'}};}
}
let pause=null;
function pauseScheduling(kind,slot,details={}){if(pause)return;pause={kind,slot,...details};try{fs.writeFileSync(path.join(outputRoot,'scheduling-paused.json'),JSON.stringify(pause,null,2),{flag:'wx',mode:0o600});}catch(error){pause.persistenceError=error.message;}}
for(const attempt of f.attempts.filter(a=>!amendment||(a.slot>=firstSlot&&a.slot<=lastSlot))){
 verify();if(pause)break;const out=path.join(outputRoot,'runs',attempt.task+(attempt.repetition?'-r'+attempt.repetition:'')+'-'+attempt.arm);
 if(fs.existsSync(out))throw Error('Previously created slot must never be retried: '+out);
 fs.mkdirSync(out,{recursive:true,mode:0o700});fs.writeFileSync(path.join(out,'started.json'),JSON.stringify({...attempt,at:new Date().toISOString()},null,2),{flag:'wx'});
 const requests=[],active=new Set(),abort=new AbortController();let session,deadline=null,timer,result,terminationVerified=false,forwardingOpen=true,deadlineTriggered=false,captureSaved=false,relayRemoved=false,captureAttempted=false,recording,recordingPersistenceError=null;
 const deadlineReason=Object.assign(new Error('Own task deadline reached'),{name:'AbortError'});
 const settleHandlers=async()=>{let timeout;try{await Promise.race([Promise.allSettled([...active]),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Provider handlers did not settle after cancellation')),5000);})]);}finally{clearTimeout(timeout);}};
 const save=()=>{try{privateJSON(path.join(out,'provider-metadata.json'),requests);return true;}catch(error){recordingPersistenceError=error.message;forwardingOpen=false;pauseScheduling('evidence_incomplete',attempt.slot,{reason:'Provider metadata persistence: '+error.message});return false;}};
 try{
  // One full profile for this research-only entry point, fixed before native requests.
  // Admission above remains independent; ordinary native sessions never call here.
  try{recording=prepareRecording(out,{run:path.basename(path.resolve(root)),slot:attempt.slot,profile:recordingProfile.name});}
  catch(error){pauseScheduling('evidence_incomplete',attempt.slot,{phase:'recording_preparation',message:error.message});throw error;}
  session=await startContainer({source:attempt.source,toolchain:f.toolchain,template:['assertion-review-pair','assertion-review-pair-preflight'].includes(f.experimentKind)?f.templates[attempt.arm]:attempt.arm==='S0'?f.baselineTemplate:attempt.arm!=='P'?f.template:f.dependencies,output:path.join(out,'session'),onRequest:(frame,rawSend,signal)=>{
   const send=message=>{if(forwardingOpen)rawSend(message);};
   const pending=(async()=>{
    const requestKind=frame.body?.tools?.length?'work':'title';
    let requestSignal;
    const record={requestIndex:requests.length+1,relayRequestId:frame.id??null,requestKind,at:new Date().toISOString(),path:frame.path,model:frame.body?.model,effort:frame.body?.reasoning?.effort??null,forwarded:false,usage:null,recording:{profile:recordingProfile.name,status:'not_started',evidenceComplete:false}};requests.push(record);save();
    let recorder,recordingEnd='not_started';
    const recordingFailed=()=>{record.evidenceIncomplete=true;pauseScheduling('evidence_incomplete',attempt.slot,{requestIndex:record.requestIndex,reason:record.recording?.error??recordingPersistenceError??'Partial provider evidence'});};
    const blocked=()=>{
     if(!pause&&!abort.signal.aborted&&!signal.aborted&&forwardingOpen&&deadline&&Date.now()<deadline)return false;
     record.notForwardedReason=pause?'series-paused':signal.aborted?'client-cancelled':'closed-or-deadline';record.blockedBy=pause;record.finishedAt=new Date().toISOString();save();
     send({type:'headers',status:409,contentType:'application/json'});send({type:'chunk',data:Buffer.from(JSON.stringify({error:{type:'experiment_admission_closed',message:'Experimental series admission is closed; no upstream request was sent.'}})).toString('base64')});send({type:'end'});return true;
    };
    if(blocked())return;
    if(frame.path!=='/v1/responses'||frame.body?.model!=='gpt-5.6-luna'||frame.body.stream!==true||frame.body?.reasoning?.effort!=='high'){pauseScheduling('boundary_refusal',attempt.slot);record.rejected=true;save();send({type:'headers',status:403,contentType:'text/plain'});send({type:'end'});return;}
    try{
     const body=JSON.stringify({...frame.body,store:false});
     try{recorder=recording.begin(record,JSON.stringify(frame.body),body);if(!save())throw Error(recordingPersistenceError);}
     catch(error){record.notForwardedReason='recording-preparation-failed';record.recordingPreparationError=error.message;recordingFailed();throw Object.assign(error,{recordingPreparation:true});}
     const a=readAuth();record.maxDurationMs=f.streamLimit==='remaining-task-budget'?Math.max(0,deadline-Date.now()):180000;record.connectionTimeoutMs=f.connectionTimeoutMs??null;save();
     const connectionAbort=new AbortController();const connectionTimer=f.connectionTimeoutMs?setTimeout(()=>connectionAbort.abort(new Error('Connection timeout')),f.connectionTimeoutMs):null;
     requestSignal=AbortSignal.any([signal,abort.signal,...(f.streamLimit==='remaining-task-budget'?[connectionAbort.signal]:[AbortSignal.timeout(180000)])]);
     let response;try {
     // Last synchronous gate, after auth/body preparation and immediately before dispatch.
     if(blocked())return;
     record.forwarded=true;record.forwardedAt=new Date().toISOString();if(!save()){record.forwarded=false;delete record.forwardedAt;record.notForwardedReason='recording-preparation-failed';recordingFailed();return;}
     response=await fetchImpl('https://chatgpt.com/backend-api/codex/responses',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${a.access}`,'ChatGPT-Account-Id':a.accountId},body,signal:requestSignal});}finally{clearTimeout(connectionTimer);}
     record.status=response.status;record.upstreamRequestId=response.headers.get('x-request-id');record.contentType=response.headers.get('content-type');recordingEnd='interrupted';save();
     if(response.status!==200){
      const refusal=[401,403,429].includes(response.status);
      record.serverCompletion=refusal?'known_refusal':'unknown';
      // Persist closure before any body await or retryable headers reach the client.
      pauseScheduling(refusal?'provider_refusal':'unknown_submission',attempt.slot,{requestIndex:record.requestIndex,status:response.status,reason:refusal?'Provider refused request':'Non-200 response without an established provider result'});
      save();
      const iterator=response.body?.[Symbol.asyncIterator]();let bytes=Buffer.alloc(0),bodyTimer;
      const expired=new Promise(resolve=>{bodyTimer=setTimeout(()=>resolve({boundedTimeout:true}),1000);});
      try{
       while(iterator){
        const next=await Promise.race([iterator.next(),expired]);
        if(next.boundedTimeout){record.errorBodyTimedOut=true;break;}
        if(next.done){recordingEnd='eof';break;}
        const b=Buffer.from(next.value),remaining=8192-bytes.length;
        if(!recorder.append(b))recordingFailed();
        bytes=Buffer.concat([bytes,b.subarray(0,remaining)]);
        record.errorBody=bytes.toString('utf8');record.errorBodyBase64=bytes.toString('base64');save();
        if(b.length>=remaining){record.errorBodyTruncated=true;break;}
       }
      }catch(error){record.errorBodyInterrupted=error.name;recordingEnd=signal.aborted||abort.signal.aborted?'interrupted':'read_error';}
      finally{clearTimeout(bodyTimer);void iterator?.return?.().catch(()=>{});}
      record.errorBody=bytes.toString('utf8');record.errorBodyBase64=bytes.toString('base64');
      if(refusal){
       let type=null,message=null;try{const value=JSON.parse(record.errorBody);type=typeof value.error?.type==='string'?value.error.type.slice(0,128):null;message=typeof value.error?.message==='string'?value.error.message.slice(0,1024):null;}catch{}
       record.refusal={status:response.status,type,message,truncated:!!record.errorBodyTruncated,bodyInterrupted:!!record.errorBodyInterrupted,bodyTimedOut:!!record.errorBodyTimedOut};
       // Refine only this first known refusal; never replace another pause or reopen admission.
       if(pause?.kind==='provider_refusal'&&pause.slot===attempt.slot&&pause.requestIndex===record.requestIndex){
        Object.assign(pause,record.refusal);if(type==='usage_limit_reached'&&!record.errorBodyTruncated&&!record.errorBodyInterrupted&&!record.errorBodyTimedOut)pause.kind='incomplete_quota';
        fs.writeFileSync(path.join(outputRoot,'scheduling-paused.json'),JSON.stringify(pause,null,2));
       }
      }
      save();
      try{send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/plain'});if(bytes.length){send({type:'chunk',data:bytes.toString('base64')});if(forwardingOpen)recorder.forwarded(bytes);}send({type:'end'});}
      finally{stopWorkload(session);abort.abort();}
      return;
     }
     send({type:'headers',status:response.status,contentType:response.headers.get('content-type')??'text/event-stream'});
     const observer=responseObserver(record,save,details=>pauseScheduling(details.kind,attempt.slot,{requestIndex:record.requestIndex,...details}));
     for await(const chunk of response.body){
      const recorded=recorder.append(chunk);
      if(!recorded)recordingFailed();
      // Observe/persist upstream facts before delivery can fail or be cancelled.
      observer.push(chunk);
      // Disk failure must not hide terminal facts in the chunk already received.
      if(!recorded||recordingPersistenceError){recordingFailed();stopWorkload(session);abort.abort();return;}
      // The observer persists response facts AND the pause synchronously, before
      // a retryable packet can reach any client (including title/helper clients).
      send({type:'chunk',data:Buffer.from(chunk).toString('base64')});if(forwardingOpen)recorder.forwarded(chunk);
      if(record.admissionStop){
       send({type:'end'});record.clientDelivery='stop-event-forwarded';save();
       stopWorkload(session);abort.abort();return;
      }
     }
     recordingEnd='eof';observer.end();record.streamEnded=true;if(record.admissionStop){send({type:'end'});stopWorkload(session);abort.abort();return;}
     if(!knownResponseTerminal(record)){record.serverCompletion='unknown';pauseScheduling('unknown_submission',attempt.slot,{reason:'Stream ended without a bound terminal provider response'});stopWorkload(session);abort.abort();return;}
     send({type:'end'});record.clientDelivery='stream-forwarded';save();
    }catch(error){
     if(recorder&&record.status!==undefined&&recordingEnd!=='eof')recordingEnd=signal.aborted||abort.signal.aborted?'interrupted':'read_error';
     if(error.recordingPreparation){forwardingOpen=false;if(session)stopWorkload(session);abort.abort();throw error;}
     if(record.admissionStop&&record.clientDelivery==='stop-event-forwarded'&&abort.signal.aborted){record.localStreamStop=error.name;return;}
     record.error=error.name;
     const ownDeadline=record.forwarded&&deadlineTriggered&&requestSignal?.reason===deadlineReason;
     record.transportError={name:error.name,clientOrRelayCancelled:signal.aborted,ownTaskDeadline:ownDeadline};
     record.clientDelivery='unconfirmed-after-transport-error';
     record.serverCompletion=knownResponseTerminal(record)?record.terminalResponse.status:[401,403,429].includes(record.status)?'known_refusal':'unknown';
     if(ownDeadline)record.cancelledByOwnTaskDeadline=true;
     if([401,403,429].includes(record.status)){record.refusal??={status:record.status,bodyInterrupted:true};pauseScheduling('provider_refusal',attempt.slot,record.refusal);}
     else if(!record.forwarded||!knownResponseTerminal(record))pauseScheduling(record.forwarded?'unknown_submission':'authorization_unavailable',attempt.slot,{error:error.name});
     forwardingOpen=false;if(session)stopWorkload(session);if(!abort.signal.aborted)abort.abort();throw error;}
    finally{if(recorder&&!recorder.finish(recordingEnd)&&['write_error','integrity_error','limit'].includes(recorder.state.status))recordingFailed();record.finishedAt=new Date().toISOString();save();}
   })();active.add(pending);return pending.finally(()=>active.delete(pending));
  }});
  const setup=session.exec(['node','-e',"const fs=require('fs');fs.mkdirSync('/work/bin');fs.copyFileSync('/template/rg','/work/bin/rg');fs.chmodSync('/work/bin/rg',0o755);fs.mkdirSync('/work/config/opencode',{recursive:true});for(const n of ['node_modules','package.json','package-lock.json'])fs.cpSync('/template/'+n,'/work/config/opencode/'+n,{recursive:true,verbatimSymlinks:true});"]);if(setup.status!==0)throw Error('Dependency preparation failed: '+setup.stderr);
  const inputRead=session.exec(['node','-e',`const fs=require('fs'),path=require('path'),{createHash}=require('crypto'),out={};function visit(d,p=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='.git')continue;const file=path.join(d,e.name),rel=p+e.name,st=fs.lstatSync(file);if(st.isSymbolicLink()){const target=fs.readlinkSync(file),resolved=path.resolve(path.dirname(file),target);if(!resolved.startsWith('/work/repo/'))throw Error('External dependency link');out[rel]={symlink:target};continue;}if(st.isDirectory())visit(file,rel+'/');else out[rel]={sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),executable:!!(st.mode&0o111)};}}visit('/work/repo');console.log(JSON.stringify(out));`]);
  if(inputRead.status!==0)throw Error('Actual input read failed');
  const got=JSON.parse(inputRead.stdout),expected=f.inputManifests[attempt.task+'-'+attempt.arm];
  if(Object.keys(got).length!==Object.keys(expected).length||Object.entries(expected).some(([k,v])=>JSON.stringify(got[k])!==JSON.stringify(v)))throw Error('Actual model container input mismatch');
  fs.writeFileSync(path.join(out,'input-verification.json'),JSON.stringify({matched:true,files:Object.keys(got).length,providerRequestsBeforeStart:requests.length}));
  const version=session.exec(['/opt/opencode','--version']);if(version.status!==0||version.stdout.trim()!=='1.18.26')throw Error('Runtime mismatch');
  deadline=Date.now()+f.budgetMs;if(f.streamLimit==='remaining-task-budget')session.setTaskBudget(f.budgetMs);timer=setTimeout(()=>{deadlineTriggered=true;forwardingOpen=false;abort.abort(deadlineReason);},f.budgetMs);
  if(captureCandidate.requiresOutputRetention){session.evidenceRequired=true;session.evidenceBaseline=session.baseline;}
  result=await runTaskImplementation(session,{config:f.config,task:fs.readFileSync(path.join(attempt.source,'TASK.md'),'utf8'),enabled:attempt.arm!=='P',arm:attempt.arm,model:f.model,variant:f.variant,limitMs:Math.max(0,deadline-Date.now()),deadline,strategy:f.strategy,continuation:f.continuation,canContinue:()=>!pause&&!abort.signal.aborted,stopWorkload});
  if(result.timedOut&&!deadlineTriggered)pauseScheduling('unattributed_timeout',attempt.slot);
  terminationVerified=result.termination?.terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');
  clearTimeout(timer);forwardingOpen=false;abort.abort();await settleHandlers();save();
  const native=session.exec(['node','-e',"const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/work/data/opencode/opencode.db',{readOnly:true});console.log(JSON.stringify({sessions:db.prepare('SELECT id,parent_id,directory,agent,model,tokens_input,tokens_output,tokens_reasoning,tokens_cache_read,tokens_cache_write FROM session').all(),messages:db.prepare('SELECT id,session_id,data FROM message').all().map(x=>({...x,data:JSON.parse(x.data)})),tools:db.prepare('SELECT id,message_id,session_id,data FROM part').all().map(x=>({...x,data:JSON.parse(x.data)})).filter(x=>x.data.type==='tool')}));db.close();"]);let nativeError=null;
  try{if(native.status!==0)throw Error('Native accounting extraction failed');fs.writeFileSync(path.join(out,'native-evidence.json'),native.stdout);}catch(error){nativeError=error;}
  captureAttempted=true;let captured;
  try{captured=captureCandidate(session,out);captureSaved=captured.status===0;}catch(error){if(nativeError){nativeError.message+='; capture also failed: '+error.message;throw nativeError;}throw error;}
  if(nativeError)throw nativeError;
  if(!captureSaved)throw Error('evidence_incomplete: '+(captured.errors?.join('; ')??'Candidate capture failed'));
  const evidence=JSON.parse(native.stdout);let workflow=null;try{workflow=JSON.parse(evidence.tools.find(t=>t.data.tool==='harness_task')?.data.state?.output);}catch{}
  const summary={...attempt,...result,requests:requests.filter(r=>r.forwarded).length,requestsWithoutUsage:requests.filter(r=>r.forwarded&&!r.usage).length,workflowStatus:workflow?.status??null,repairs:workflow?.repairs??null,toolCalls:evidence.tools.length,sessions:evidence.sessions.length,delivery:attempt.arm!=='P'?workflow?.executionDirectory??null:'/work/repo',ownTaskDeadlineTriggered:deadlineTriggered};
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 }catch(error){fs.writeFileSync(path.join(out,'error.json'),JSON.stringify({message:error.message},null,2));pauseScheduling('execution_or_capture_error',attempt.slot,{message:error.message});if(session&&!captureAttempted){try{terminationVerified=stopWorkload(session).terminationVerified===true;if(!terminationVerified)throw Error('Termination not verified');captureAttempted=true;captureSaved=captureCandidate(session,out).status===0;}catch(captureError){fs.writeFileSync(path.join(out,'capture-error.json'),JSON.stringify({kind:'evidence_incomplete',message:captureError.message,primaryError:error.message},null,2));}}}
 finally{
  clearTimeout(timer);forwardingOpen=false;abort.abort();
  try{
   try{await settleHandlers();}catch(error){pauseScheduling('provider_handlers_unsettled',attempt.slot,{message:error.message});}
   save();
  }finally{
   if(session){
    if(recordingPersistenceError){session.evidenceRequired=true;session.evidenceComplete=false;}
    const cleanup=session.close();relayRemoved=cleanup===0;
    if(cleanup!==0){pauseScheduling(cleanup===2?'evidence_incomplete':'cleanup_unverified',attempt.slot,{resource:session.retainedResource??null});if(cleanup!==2)throw Error('Container cleanup failed');}
   }
  }
 }
 const stopFacts={ownTaskDeadlineTriggered:deadlineTriggered,terminationVerified,captureSaved,forwardingClosed:!forwardingOpen,relayRemoved,activeProviderHandlers:active.size,providerServerStateMayRemainUnknown:requests.some(r=>r.forwarded&&!knownResponseTerminal(r)&&r.serverCompletion!=='known_refusal')};
 fs.writeFileSync(path.join(out,'stop-verification.json'),JSON.stringify(stopFacts,null,2));
 if(!terminationVerified||!captureSaved||!relayRemoved||forwardingOpen||active.size)pauseScheduling('local_execution_unverified',attempt.slot,stopFacts);
 if(terminationVerified)fs.writeFileSync(path.join(out,'completed.json'),JSON.stringify({...attempt,terminationVerified,at:new Date().toISOString()},null,2),{flag:'wx'});
}
fs.writeFileSync(path.join(outputRoot,'outcome.json'),JSON.stringify({status:pause?'paused':'finished',pause},null,2));console.log(JSON.stringify({status:pause?'paused':'finished',pause}));

return {status:pause?'paused':'finished',pause};
}

function verifyHistoricalContainers(historical){
 const names=new Set(execFileSync('docker',['ps','-a','--format','{{.Names}}'],{encoding:'utf8',timeout:30000}).trim().split('\n'));
 if(historical.some(r=>typeof r.container!=='string'||!r.container||names.has(r.container)))throw Error('Historical container absent-state not verified');
}
