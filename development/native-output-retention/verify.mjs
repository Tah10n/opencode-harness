import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const run=(file,args=[])=>{const r=spawnSync(process.execPath,['development/native-output-retention/'+file,...args],{stdio:'inherit'});assert.equal(r.status,0,file+' '+args.join(' '));};
run('reproduce.mjs');run('verify-boundaries.mjs');
for(const mode of ['success','copy-failure','corrupt','limit','patch-failure','metadata-failure','cancel']){
 run('verify-installed.mjs',[mode]);
 if(!['success','cancel'].includes(mode)){
  const root='local/native-output-retention';const latest=fs.readdirSync(root).filter(n=>n.startsWith(mode+'-')).sort().at(-1);
  run('recover.mjs',[path.resolve(root,latest,'runs/output-fixture-P')]);
 }
}
