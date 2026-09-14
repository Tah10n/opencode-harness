// Existing host-side OpenCode authorization only. No credentials enter the
// container, task source, provider prompt, result artifact or console.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {startContainer} from './container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';
import {captureCandidate} from './capture-candidate.mjs';
import {runComparison} from './run-comparison.mjs';
function readAuth(){
 const auth=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.local/share/opencode/auth.json'),'utf8')).openai;
 if(auth?.type!=='oauth'||typeof auth.access!=='string'||!auth.access||typeof auth.accountId!=='string'||!auth.accountId||!Number.isFinite(auth.expires)||auth.expires<=Date.now())throw Error('Existing OpenCode authorization unavailable or expired');
 return {access:auth.access,accountId:auth.accountId};
}
readAuth();
await runComparison({root:path.resolve(process.argv[2]??'local/native-task-ab'),startContainer,stopWorkload,captureCandidate,readAuth,continuationFile:process.argv[3]?path.resolve(process.argv[3]):null});
