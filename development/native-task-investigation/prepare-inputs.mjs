import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]);
if(fs.existsSync(root))throw Error('Do not replace prepared inputs');fs.mkdirSync(root,{recursive:true});
const sources={'quick-lru-take':'quick-lru-computed','denque-drain':'denque-remove-where','eventemitter-collect':'eventemitter-prepend'};
const sha=b=>createHash('sha256').update(b).digest('hex');
const facts=[];
for(const [task,old] of Object.entries(sources)){
 const source=path.resolve('local/native-task-h00-transfer/inputs',old),dest=path.join(root,'inputs',task);
 fs.cpSync(source,dest,{recursive:true,verbatimSymlinks:true});
 if(fs.existsSync(dest+'/.git'))throw Error('Prepared public source unexpectedly contains Git history');
 const prompt=fs.readFileSync('development/native-task-investigation/tasks/'+task+'/TASK.md');fs.writeFileSync(dest+'/TASK.md',prompt);
 fs.writeFileSync(dest+'/AGENTS.md','Implement the full TASK.md request. Preserve unmentioned public behavior and useful existing tests. Use the installed npm dependencies and native tools. Do not use network installation, commit or publish. Keep required implementation, project tests, public types and documentation together. Report actual checks and remaining limitations.\n');
 if(task==='eventemitter-collect')fs.cpSync(path.resolve('node_modules/typescript'),dest+'/node_modules/typescript',{recursive:true,verbatimSymlinks:true});
 facts.push({task,publicProject:JSON.parse(fs.readFileSync(dest+'/package.json')).name,version:JSON.parse(fs.readFileSync(dest+'/package.json')).version,publicSourceSnapshot:old,promptSha256:sha(prompt),indexSha256:sha(fs.readFileSync(dest+'/index.js'))});
}
fs.writeFileSync(root+'/preparation.json',JSON.stringify({createdAt:new Date().toISOString(),facts,realProviderRequests:0},null,2));
console.log(JSON.stringify({prepared:root,tasks:facts.map(f=>f.task),realProviderRequests:0}));
