import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const local=path.resolve('local/preservation-nudge-model-pair'),dev='development/preservation-nudge/model-pair',get=p=>JSON.parse(fs.readFileSync(p)),hash=x=>createHash('sha256').update(x).digest('hex');
const f=get(local+'/prepared.json'),checks=[];
assert.equal(get(local+'/preflight/verification.json').passed,true);
for(const arm of ['OFF','ON']){
 const dir=local+'/preflight/runs/sveltejs__svelte-1190-'+arm,result=get(dir+'/result.json'),stop=get(dir+'/stop-verification.json'),native=get(dir+'/native-evidence.json');
 assert.ok(result.nativeCompleted&&stop.terminationVerified&&stop.captureSaved&&stop.relayRemoved&&!stop.activeProviderHandlers);
 assert.equal(native.sessions.length,2);assert.equal(native.sessions.filter(s=>s.parent_id).length,1);
 const art=dir+'/task-artifacts/'+fs.readdirSync(dir+'/task-artifacts')[0];
 assert.equal(fs.existsSync(art+'/preservation-nudge.json'),arm==='ON');
 for(const name of ['type-compat.json','project-context.json','project-checks.json','sensitivity.json','investigation.json'])assert.ok(!fs.existsSync(art+'/'+name));
 const events=get(art+'/tool-events.json');assert.ok(!JSON.stringify(events).includes('Preservation advisory:'));
 const requests=fs.readdirSync(dir).filter(n=>/^request-\d+\.json$/.test(n)).map(n=>get(dir+'/'+n));
 const inventories=requests.filter(r=>r.tools?.length).map(r=>r.tools.map(t=>t.name));assert.ok(inventories.some(i=>i.includes('harness_task')));assert.ok(inventories.some(i=>!i.includes('harness_task')));assert.ok(inventories.every(i=>!i.includes('webfetch')));
 const metadata=get(dir+'/provider-metadata.json');assert.equal(metadata.length,7);assert.ok(metadata.every(r=>r.forwarded&&r.terminalResponse?.status==='completed'&&r.usage?.input_tokens===1&&r.usage?.output_tokens===1));
 const portable=local+'/preflight-portable-'+arm;assert.ok(!fs.existsSync(portable));fs.mkdirSync(portable);execFileSync('tar',['-xf',path.dirname(f.attempts[0].source)+'/base.tar','-C',portable]);execFileSync('git',['init','--quiet'],{cwd:portable});execFileSync('git',['add','.'],{cwd:portable});execFileSync('git',['-c','user.name=Development','-c','user.email=development@localhost','-c','core.hooksPath=/dev/null','commit','--quiet','-m','Exact source archive baseline'],{cwd:portable});execFileSync('git',['apply','--check',dir+'/model.patch'],{cwd:portable});execFileSync('git',['apply',dir+'/model.patch'],{cwd:portable});assert.equal(fs.readFileSync(portable+'/preflight-marker.txt','utf8'),'scripted recorder check, not a model solution\n');
 checks.push({arm,nativeCompleted:true,stopVerified:true,requests:metadata.length,terminalResponses:metadata.length,usage:{input:7,output:7},noWebfetch:true,parentAndAuthorInventories:true,rawEventsUnchanged:true,patchApplies:true,patchSha256:hash(fs.readFileSync(dir+'/model.patch')),checks:events.filter(e=>e.tool==='bash').map(e=>({command:e.args.command,exit:e.exit,durationMs:e.completedAt-e.startedAt})),advisoryState:arm==='ON'?get(art+'/preservation-nudge.json'):null});
}
const lines=fs.readFileSync(local+'/advisory-preflight-console.log','utf8').trim().split('\n'),advisory=JSON.parse(lines.at(-1));assert.equal(advisory.realProviderCalls,0);assert.equal(advisory.results.length,1);assert.ok(advisory.results[0].received&&advisory.results[0].receivedFailure&&advisory.results[0].portable.exit===0);
for(const [name,h]of Object.entries(advisory.results[0].installed))assert.equal(hash(fs.readFileSync(local+'/bundle/'+name)),h);
const receipt={passed:true,realProviderRequests:0,checks,advisory,scriptedRequests:checks.reduce((n,c)=>n+c.requests,0)+advisory.results[0].requests};fs.writeFileSync(dev+'/preflight.json',JSON.stringify(receipt,null,2)+'\n');console.log('Pair preparation verified: 27 scripted requests, 0 real requests');
