// Publish safe derived facts only, after neutral acceptance and mechanism review.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=path.resolve('local/native-type-compat-offline-subscribe/repeatability'),dev=path.resolve('development/native-type-compat-offline-subscribe/repeatability'),read=p=>JSON.parse(fs.readFileSync(p)),hash=b=>createHash('sha256').update(b).digest('hex');
const account=read(root+'/accounting.json'),inspection=read(root+'/inspection.json'),mapping=read(root+'/neutral/mapping.json'),review=read(dev+'/neutral-review.json'),grading=read(root+'/grading-checks.json'),authorTypes=read(root+'/author-types.json'),patchChecks=read(root+'/patch-checks.json'),mechanism=read(dev+'/compiler-evidence.json');
fs.mkdirSync(dev+'/patches',{recursive:true});const rows=[];
for(const a of account.rows){if(a.status==='not_started'){rows.push(a);continue;}
 const m=mapping.find(m=>m.slot===a.slot),i=inspection.rows.find(i=>i.slot===a.slot),q=review.rows.find(q=>q.id===m.id),g=grading.find(g=>g.id===m.id),p=patchChecks.find(p=>p.id===m.id),types=authorTypes.find(t=>t.id===m.id);
 const bytes=fs.readFileSync(root+'/neutral/'+m.id+'.patch');assert.equal(hash(bytes),m.sha256);const name='A-r'+a.repetition+'-'+a.arm+'.patch';fs.writeFileSync(dev+'/patches/'+name,bytes,{flag:'wx'});
 const d=root+'/runs/A-r'+a.repetition+'-'+a.arm,adir=d+'/candidate/.git/harness-task',art=fs.existsSync(adir)?adir+'/'+fs.readdirSync(adir)[0]:null;
 const messages=art&&fs.existsSync(art+'/implementation-messages.json')?read(art+'/implementation-messages.json'):[];
 const finals=messages.filter(m=>m.info?.finish==='stop').flatMap(m=>m.parts.filter(p=>p.type==='text').map(p=>p.text));
 const T=!!(a.nativeCompleted&&a.stop.terminationVerified&&a.stop.relayRemoved&&a.stop.captureSaved&&a.stop.forwardingClosed&&a.stop.activeProviderHandlers===0&&m.kind==='terminal'&&art&&read(art+'/result.json').termination.verified&&messages.some(m=>m.parts.some(p=>p.type==='step-finish'&&p.reason==='stop')));
 if(q.Q)assert.ok(g.checksPassed&&types.status===0&&p.applyCheck.status===0&&p.apply.status===0&&!p.forbiddenPaths.length&&!p.serviceContentHits.length);
 const bash=i.tools.filter(t=>t.tool==='bash').map(t=>({callID:t.callID,command:t.input.command,exit:t.exit,state:t.status,time:t.time,outputSha256:hash(t.output??'')}));
 rows.push({...a,neutralID:m.id,patch:{path:'patches/'+name,sha256:m.sha256,bytes:m.bytes,kind:m.kind},Q:q.Q,T,D:q.Q&&T,acceptance:q,grading:g,authorTypes:types,patchChecks:p,author:{tools:i.tools.filter(t=>t.tool!=='harness_task').length,bash,finals},inventories:i.inventories});
}
const complete=rows.every(r=>r.status==='executed'),on=rows.filter(r=>r.arm==='ON'),off=rows.filter(r=>r.arm==='OFF'),counts={ON:on.filter(r=>r.D).length,OFF:off.filter(r=>r.D).length};
const A=mechanism.rows.some(r=>r.usefulRepairChain===true),B=complete&&counts.ON>counts.OFF&&!mechanism.deliveryDifferenceOnlyExternalInterruption,positive=complete&&on.length===2&&on.every(r=>r.D)&&B&&A;
const results={candidate:'e18db1fe10223db52dcc05b3e769bca140367c2b',scope:'Four newly assigned repeats of one known development task; previous positive pair excluded',outcome:read(root+'/outcome.json'),rows,decision:{complete,fullDeliveries:counts,mechanismRepeated:A,deliveryAdvantageRepeated:B,positiveReadiness:positive,nextCampaignAuthorized:false,defaultChanged:false},tokenAccounting:account.tokenAccounting,monetaryCost:null,effortBoundary:'Preparation, external evaluation and developing-agent effort are separate; exact developing-agent telemetry unavailable.'};
fs.writeFileSync(dev+'/RESULTS.json',JSON.stringify(results,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:rows.map(r=>({slot:r.slot,arm:r.arm,Q:r.Q,T:r.T,D:r.D})),decision:results.decision}));
