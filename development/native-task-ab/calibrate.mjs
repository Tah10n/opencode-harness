import fs from 'node:fs';
import path from 'node:path';
import {cases,types} from './evaluation-cases.mjs';
import {controlFiles} from './control-patches.mjs';
import {projectCheck} from './project-check.mjs';
const root=path.resolve(process.argv[2]??'local/native-task-ab');
const runtime=process.argv[3];if(!runtime)throw Error('Explicit existing toolchain path required');
const selected=process.argv.slice(4);
const tasks=JSON.parse(fs.readFileSync(new URL('./tasks.json',import.meta.url)));
const negatives={
 'limit-function-controls':['wrong-snapshot'], 'clear-queue-reason':['wrong-falsy','wrong-disabled'],
 'bind-methods-atomic':['wrong-partial'], 'listener-count-deduplicate':['wrong-symbol-string'],
 'clear-queue-count':['wrong-includes-active','wrong-after-clear'], 'abortable-queue-waiters':['wrong-initial','wrong-leaks'],
};
const results=[];
for(const task of tasks.filter(t=>!selected.length||selected.includes(t.id))){
 for(const variant of ['unchanged','reference','alternative',...negatives[task.id]]){
  const source=path.join(root,'inputs',task.id),files=controlFiles(task.id,source,variant);
  files['.evaluation.test.mjs']=cases[task.id];files['.evaluation.types.ts']=types[task.id];
  const overlay=Object.fromEntries(Object.entries(files).map(([n,b])=>[n,Buffer.from(b).toString('base64')]));
  const command=['sh','-c',`node ${task.project==='p-queue'?'--import=tsx/esm ':''}--test .evaluation.test.mjs && node node_modules/typescript/bin/tsc --noEmit --strict --target esnext --module nodenext --moduleResolution nodenext --skipLibCheck .evaluation.types.ts`];
  const output=path.join(root,process.env.CALIBRATION_DIRECTORY??'calibration',task.id,variant);
  const result=await projectCheck({source,output,toolchain:path.resolve(runtime),command,overlay});
  const expectedPass=['reference','alternative'].includes(variant),row={task:task.id,variant,expectedPass,...result,matched:(result.exit===0)===expectedPass};results.push(row);
  fs.writeFileSync(path.join(root,process.env.CALIBRATION_DIRECTORY??'calibration',task.id,'results.json'),JSON.stringify(results.filter(r=>r.task===task.id),null,2)+'\n');console.log(JSON.stringify(row));
  if(!row.matched)throw Error('Calibration mismatch: '+task.id+' '+variant+'; inspect retained output, do not weaken the rubric');
 }
}
