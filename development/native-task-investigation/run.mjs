// Exactly nine fresh P/R/H slots, using the established fail-closed transport.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {availabilityProbe} from './availability-probe.mjs';
import {startContainer} from '../native-task-ab/container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from '../native-task-ab/capture-candidate.mjs';
import {runComparison} from '../native-task-ab/run-comparison.mjs';
export const readAuth=()=>{const a=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'))).openai;if(a?.type!=='oauth'||!a.access||!a.accountId||a.expires<=Date.now())throw Error('Existing authorization unavailable or expired');return{access:a.access,accountId:a.accountId};};
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runComparison({root:path.resolve(process.argv[2]),beforeTasks:out=>availabilityProbe({out,readAuth}),continuationFile:process.argv[3]?path.resolve(process.argv[3]):null,readAuth,captureCandidate,stopWorkload,startContainer:args=>startContainer({...args,workMemoryMb:1536,memoryMb:3072})});
