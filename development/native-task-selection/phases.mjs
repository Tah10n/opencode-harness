import fs from 'node:fs';
import path from 'node:path';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
import {assessDecision} from './decision.mjs';
export const finalInstruction='Planned decision stage in this SAME native session. Research has ended. Use only observations already obtained and the original full task. No tools, new checks, repairs or other judge. Complete the RESULT records for necessary behavior, preserved contracts and explicitly delivered tests/docs, mark missing evidence unverified, then return one DECISION line and a brief basis. Do not infer success from a green suite or substitute a diagnostic for a required delivered consumer regression. This is the reserved final stage, not a request to retry or repair an earlier decision.';
export async function runSelector(session,options,{phase=runNativePhase,now=Date.now}={}) {
 const start=now(),deadline=options.deadline??start+options.limitMs,researchDeadline=start+options.researchMs;
 options.setClock?.({deadline,researchDeadline});
 const phases=[];
 const run=async(name,opts)=>{const output=path.join(session.output,name);fs.mkdirSync(output);const r=await phase({...session,output},opts);phases.push(r);return r;};
 const first=await run('research',{...options,deadline,limitMs:Math.max(1,deadline-now()),researchMs:Math.max(0,researchDeadline-now())});
 // A normal completed decision (even inconsistent) is never retried or repaired.
 const firstText=first.events.filter(e=>e.type==='text').map(e=>e.part?.text??'').join('\n');
 const emitted=/^DECISION: (X|Y|NEITHER|INSUFFICIENT)\s*$/m.test(firstText);
 const ids=[...new Set(first.events.map(e=>e.sessionID).filter(Boolean))];
 const completed=r=>r.exitCode===0&&!r.timedOut&&!r.stopReason&&!r.parseErrors&&r.termination?.terminationVerified&&!r.termination.killed?.length&&r.researchBoundary!=='pending'&&r.researchBoundary!=='failed'&&!r.events.some(e=>e.type==='error')&&r.events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop');
 const normal=completed(first),canFinalize=()=>!options.signal?.aborted&&(options.canFinalize?.()??true);
 if(!emitted&&normal&&first.termination?.terminationVerified&&ids.length===1&&now()<deadline&&canFinalize()) {
  await options.beforeFinal?.();
  if(now()<deadline&&canFinalize())await run('decision',{...options,deadline,researchMs:undefined,researchStopped:undefined,sessionID:ids[0],enabled:false,task:finalInstruction,config:{...options.config,permission:{'*':'deny',edit:'deny',bash:'deny',external_directory:'deny'},tools:{...options.config.tools,read:false,glob:false,grep:false,bash:false,edit:false,write:false,apply_patch:false,task:false,webfetch:false,websearch:false,todoread:false,todowrite:false,question:false,skill:false,invalid:false}},limitMs:Math.max(1,deadline-now())});
 }
 const last=phases.at(-1),text=last.events.filter(e=>e.type==='text').map(e=>e.part?.text??'').join('\n');
 // Native completion is fixed before stop confirmation and journal persistence.
 const terminal=completed(last);
 const assessment=assessDecision(text);
 return {...last,events:phases.flatMap(p=>p.events),answer:text,assessment,decision:terminal&&(last.completedAt??now())<deadline&&assessment.consistent?assessment.decision:null,timedOut:last.timedOut,elapsedMs:now()-start,phaseCount:phases.length,researchTimedOut:first.timedOut,phaseFacts:phases.map(({events,stderr,...r})=>r)};
}
