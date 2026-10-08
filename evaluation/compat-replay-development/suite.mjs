import fs from 'node:fs';
import path from 'node:path';
export const directory=import.meta.dirname;
export const repository=path.resolve(directory,'../..');
export const runId='compat-replay-development-v1';
export const tasks=fs.readdirSync(path.join(directory,'tasks')).sort().map(id=>({...JSON.parse(fs.readFileSync(path.join(directory,'tasks',id,'task.json'))),directory:path.join(directory,'tasks',id),source:path.join(directory,'tasks',id,'source')}));
export const schedule=tasks.flatMap((task,i)=>(i%2?['candidate','control']:['control','candidate']).map((arm,j)=>({slot:i*2+j+1,task:task.id,arm})));
export const realBatch=path.join(repository,'local/compat-replay-20261008/batch');
export const executionManifest='evaluation/compat-replay-development/evidence/execution-freeze.json';
