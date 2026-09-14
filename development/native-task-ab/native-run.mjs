// One native phase per task. Reuse the established native termination runner;
// flags are process environment, not rewritten author prompts or extra phases.
import {spawn} from 'node:child_process';
import {runNativePhase} from '../native-task-abc/native-run.mjs';

export async function runTask(session, options) {
  const flags={P:'00',H00:'00',H10:'10',H01:'01',H11:'11',H0:'00',H1:'00',S0:'00',S1:'00'}[options.arm];
  if(!flags)throw Error('Unknown factorial arm');
  const result=await runNativePhase(session,{...options,strategy:'direct'},{spawnProcess:(command,args,settings)=>{
    if(options.enabled){
      const at=args.indexOf(session.name);if(at<0)throw Error('Native container argument unavailable');
      args=[...args.slice(0,at),'--env','HARNESS_TASK_CONTEXT='+flags[0],'--env','HARNESS_TASK_CHECKS='+flags[1],...args.slice(at)];
      if (['H0','H1','S0','S1'].includes(options.arm)) {
        const pos=args.indexOf(session.name);
        args=[...args.slice(0,pos),'--env','HARNESS_TASK_SENSITIVITY='+(options.arm==='H0'?'0':'1'),...args.slice(pos)];
      }
    }
    return spawn(command,args,settings);
  }});
  const ids=[...new Set(result.events.map(e=>e.sessionID).filter(Boolean))];
  const {events,stderr,...summary}=result;
  return {...summary,phaseCount:1,firstSessionID:ids.length===1?ids[0]:null,continuationApplied:false,
    nativeCompleted:result.exitCode===0&&!result.timedOut&&!result.parseErrors&&!events.some(e=>e.type==='error')&&events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')};
}
