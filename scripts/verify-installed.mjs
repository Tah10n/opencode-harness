// Actual installed OpenCode with loopback fixtures, isolated HOME, no model credentials.
import {spawnSync} from 'node:child_process';
const checks=[['verify-native-template-config.mjs','--review'],['verify-native-template-config.mjs','--offline'],['verify-native-review-fixture.mjs'],['verify-native-task-format.mjs'],['verify-native-task-fixture.mjs']];
for(const args of checks){const result=spawnSync(process.execPath,['scripts/'+args[0],...args.slice(1)],{stdio:'inherit',timeout:600000});if(result.status!==0)throw result.error??Error(args[0]+' failed ('+result.status+')');}
