import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('local/native-command-hints-comparison/batch');const summaries=[];
for(const [task,arm]of [['A','OFF'],['A','ON'],['B','ON'],['B','OFF']]){
 const dir=root+'/preflight-'+task+'-'+arm,read=n=>JSON.parse(fs.readFileSync(dir+'/request-'+n+'.json'));
 const output=n=>read(n).input.filter(x=>x.type==='function_call_output').at(-1).output;
 const full=output(8);if(task==='A'){assert.match(full,/Test Files\s+\d+ passed/);assert.match(full,/Total dist size/);}else assert.match(full,/created.*dist/s);
 if(task==='B'){assert.match(output(6),/\d+ passing/);assert.match(output(7),/\d+ passing/);}
 let hint=null;const marker='Host-derived project command context:\n';if(task==='A'&&arm==='ON')hint=JSON.parse(output(6).split(marker)[1]);else assert.ok(!output(6).includes(marker));
 const container=JSON.parse(fs.readFileSync(dir+'/container.json'));assert.ok(container.argv.includes('none'));assert.ok(!container.argv.some(x=>/reference|evaluation|calibration/.test(x)));
 assert.equal(JSON.parse(fs.readFileSync(dir+'/cleanup.json')).status,0);
 summaries.push({task,arm,fullProjectChecksObserved:true,containerRemoved:true,hint});
}
fs.writeFileSync(root+'/preflight-audit.json',JSON.stringify({passed:true,results:summaries,realProviderRequests:0},null,2)+'\n');console.log('Actual project output, permission isolation and cleanup audited in all four scripted preparations');
