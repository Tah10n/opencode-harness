import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=path.resolve('local/native-type-compat-offline-subscribe/repeatability'),rows=[];const hash=b=>createHash('sha256').update(b).digest('hex');
for(const key of ['A-OFF','A-ON']){
 const d=root+'/preflight/runs/'+key,e=JSON.parse(fs.readFileSync(d+'/native-evidence.json')),bash=e.tools.filter(t=>t.data.tool==='bash');
 for(const command of ['npm test','npm run test-esm','npm run rollup']){const tools=bash.filter(t=>t.data.state.input.command===command);assert.ok(tools.length);for(const t of tools){assert.equal(t.data.state.status,'completed');assert.match(t.data.state.output,command==='npm run rollup'?/created.*dist/s:/\d+ passing/);}}
 const good=bash.find(t=>t.data.state.input.command.includes('cat > compiler-ready.ts'));
 const bad=bash.find(t=>t.data.state.input.command.includes(' > compiler-error.ts'));
 assert.equal(good?.data.state.status,'completed');assert.equal(good?.data.state.metadata.exit,0);
 assert.equal(bad?.data.state.status,'completed');assert.notEqual(bad?.data.state.metadata.exit,0);assert.match(bad.data.state.output,/TS2322/);
 const art=d+'/candidate/.git/harness-task',a=art+'/'+fs.readdirSync(art)[0],checks=[];
 if(key.endsWith('ON')){const compat=JSON.parse(fs.readFileSync(a+'/type-compat.json'));for(const run of compat.runs){const tool=bash.find(t=>t.data.state.output.includes(run.snapshot));assert.ok(tool);const callID=tool.data.callID;assert.ok(callID);const files=fs.readdirSync(d).filter(n=>/^request-\d+\.json$/.test(n));const received=files.find(n=>JSON.parse(fs.readFileSync(d+'/'+n)).input?.some(x=>x.type==='function_call_output'&&x.call_id===callID&&JSON.stringify(x.output).includes(run.snapshot)));assert.ok(received,'Bound callID+snapshot not received');checks.push({snapshot:run.snapshot,baselineSnapshot:run.baselineSnapshot,status:run.status,callID,request:received,requestHash:hash(fs.readFileSync(d+'/'+received))});}}
 const container=JSON.parse(fs.readFileSync(d+'/session/container.json'));assert.ok(container.argv.includes('none'));assert.ok(!container.argv.some(v=>/evaluation|reference|calibration/.test(v)));assert.equal(JSON.parse(fs.readFileSync(d+'/session/cleanup.json')).status,0);
 rows.push({key,ordinaryCommands:true,noEvaluatorMount:true,removed:true,checks});
}
fs.writeFileSync(root+'/preflight-audit.json',JSON.stringify({passed:true,rows,realProviderRequests:0},null,2));console.log('Capture callID, snapshots, outgoing request, project checks and cleanup audited');
