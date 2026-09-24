// Reuse the native phase runner and the init-aware termination boundary.
import {runNativePhase} from '../../native-task-abc/native-run.mjs';
import {stopWorkload} from './stop-workload.mjs';
export function runOpenCode(session,options){return runNativePhase(session,{...options,stopWorkload});}
