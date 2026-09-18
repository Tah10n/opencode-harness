import fs from 'node:fs';import path from 'node:path';import {controlFiles} from './control-patches.mjs';import {projectCheck} from '../project-check.mjs';
const root=path.resolve('local/native-task-ab/transfer'),toolchain=path.resolve('../verified-change-harness/local/template-toolchain-20260908');
for(const id of ['promise-clear-queue','throttle-callback-receivers'])for(const variant of ['reference','alternative']){
 if(process.argv[2] && process.argv[2]!==id+'/'+variant)continue;
 const source=root+'/inputs/'+id,files=controlFiles(id,source,variant);let typed=fs.readFileSync(source+'/index.test-d.ts','utf8');
 if(id==='promise-clear-queue'){typed=typed.replace("import {expectType}","import {expectType, expectAssignable}").replace("expectType<(input: number) => Promise<number>>(pDebounce.promise(expensiveCall));","expectAssignable<(input: number) => Promise<number>>(pDebounce.promise(expensiveCall));\nconst clearable = pDebounce.promise(expensiveCall);\nexpectType<Promise<number>>(clearable(1));\nexpectType<number>(clearable.clearQueue({why: 'stop'}));");}
 files['index.test-d.ts']=typed;const overlay=Object.fromEntries(Object.entries(files).map(([n,s])=>[n,Buffer.from(s).toString('base64')]));
 const result=await projectCheck({source,output:root+'/'+(process.env.CONTROL_DIRECTORY??'full-controls')+'/'+id+'/'+variant,toolchain,overlay,command:['sh','-c','npm exec --offline -- xo --fix index.js index.d.ts index.test-d.ts && npm test'],captureFiles:['index.js','index.d.ts','index.test-d.ts']});console.log(JSON.stringify({id,variant,exit:result.exit,elapsedMs:result.elapsedMs}));if(result.exit!==0)throw Error('Full control failed; inspect preserved output');
}
