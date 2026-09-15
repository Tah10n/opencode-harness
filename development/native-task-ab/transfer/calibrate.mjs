import fs from 'node:fs';import path from 'node:path';import {cases,types} from './evaluation-cases.mjs';import {controlFiles} from './control-patches.mjs';import {projectCheck} from '../project-check.mjs';
const root=path.resolve('local/native-task-ab/transfer'),toolchain=path.resolve('../verified-change-harness/local/template-toolchain-20260908');
for(const id of process.argv.slice(2).length?process.argv.slice(2):Object.keys(cases)){
 const variants=['unchanged','reference','alternative',...(id==='promise-clear-queue'?['wrong-falsy','wrong-count','wrong-still-runs','wrong-active-reset']:['wrong-weight','wrong-delay','wrong-options'])],rows=[];
 for(const variant of variants){const source=root+'/inputs/'+id,files={...controlFiles(id,source,variant),'.evaluation.test.mjs':cases[id],'.evaluation.types.ts':types[id]},overlay=Object.fromEntries(Object.entries(files).map(([n,s])=>[n,Buffer.from(s).toString('base64')]));
 const r=await projectCheck({source,output:root+'/'+(process.env.CALIBRATION_DIRECTORY??'calibration')+'/'+id+'/'+variant,toolchain,overlay,command:['sh','-c','node --test .evaluation.test.mjs && node node_modules/typescript/bin/tsc --noEmit --strict --target esnext --module nodenext --moduleResolution nodenext --skipLibCheck .evaluation.types.ts']});
 const expectedPass=['reference','alternative'].includes(variant),row={id,variant,expectedPass,exit:r.exit,elapsedMs:r.elapsedMs,termination:r.termination,realProviderRequests:0,matched:(r.exit===0)===expectedPass};rows.push(row);fs.writeFileSync(root+'/'+(process.env.CALIBRATION_DIRECTORY??'calibration')+'/'+id+'/results.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(row));if(!row.matched)throw Error('Calibration mismatch; retain outcome and inspect contract');
 }
}
