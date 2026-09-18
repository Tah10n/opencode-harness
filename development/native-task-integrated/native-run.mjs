// Same native direct session and termination runner. All optional flags explicit.
import {spawn} from 'node:child_process';
import {runNativePhase} from '../native-task-abc/native-run.mjs';
export async function runTask(session,options){
 if(!['P','Hbase','Htools','OFF','ON'].includes(options.arm))throw Error('Unknown arm');
 const result=await runNativePhase(session,{...options,strategy:'direct'},{spawnProcess:(command,args,settings)=>{
  const at=args.indexOf(session.name);if(at<0)throw Error('Container missing');
  const extra=['HARNESS_TASK_CONTEXT=0','HARNESS_TASK_CHECKS=0','HARNESS_TASK_EXTRA_ATTENTION=0','HARNESS_TASK_SENSITIVITY='+(options.arm==='Htools'?'1':'0'),'HARNESS_TASK_INVESTIGATION='+(options.arm==='Htools'?'1':'0')];
  if(['OFF','ON'].includes(options.arm))extra.push('HARNESS_TASK_COMMAND_HINTS='+(options.arm==='ON'?'1':'0'));
  args=[...args.slice(0,at),...extra.flatMap(value=>['--env',value]),...args.slice(at)];
  if (options.arm === 'P') {
    const end=args.lastIndexOf('--');if(end<0||args[end+1]!==options.task)throw Error('Plain task argument mismatch');
    args=args.slice(0,end);args.splice(1,0,'--interactive');
    const child=spawn(command,args,{...settings,stdio:['pipe','pipe','pipe']});child.stdin.end(options.task);return child;
  }
  return spawn(command,args,settings);
 }});
 const ids=[...new Set(result.events.map(e=>e.sessionID).filter(Boolean))];const {events,stderr,...summary}=result;
 return {...summary,phaseCount:1,firstSessionID:ids.length===1?ids[0]:null,continuationApplied:false,nativeCompleted:result.exitCode===0&&!result.timedOut&&!result.parseErrors&&!events.some(e=>e.type==='error')&&events.some(e=>e.type==='step_finish'&&e.part?.reason==='stop')};
}
