// Publish only selected public fixture facts, never raw provider/native archives.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {treeHash,sha,readTree,writeTree} from './policy.mjs';
const [input,output]=process.argv.slice(2);
if(fs.existsSync(output))throw Error('Fresh evidence destination required');fs.mkdirSync(output,{recursive:true});
const read=file=>JSON.parse(fs.readFileSync(file));
const save=(name,value)=>fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
const verification=read(path.join(input,'verification.json'));
const rows=[];
for(const row of verification.rows) {
  const root=path.join(input,row.name),journal=read(path.join(root,'journal.json')),freeze=read(path.join(root,'freeze.json'));
  const stageFacts=[];
  const optional=file=>fs.existsSync(file)?read(file):null;
  for(const start of journal.filter(e=>e.event==='stage-admitted')) {
    const out=path.join(root,'stages',start.label,'runs/task-P'),finished=journal.find(e=>e.event==='stage-finished'&&e.label===start.label);
    const requests=fs.existsSync(path.join(out,'provider-metadata.json'))?read(path.join(out,'provider-metadata.json')):[];
    const container=fs.existsSync(path.join(out,'session/container.json'))?read(path.join(out,'session/container.json')):null;
    const native=fs.existsSync(path.join(out,'native-evidence.json'))?read(path.join(out,'native-evidence.json')):null;
    const tools=native?.tools.map(t=>t.data)??[];
    const solver=start.role==='solver';
    const tree=solver&&fs.existsSync(path.join(out,'snapshot.json'))?read(path.join(out,'snapshot.json')).tree:null;
    if(tree&&['plain-single','plain-multi','adaptive-k1'].includes(row.name)) {
      const dest=path.join(output,row.name,start.label);writeTree(dest,tree);
      const patch=fs.readFileSync(path.join(out,'model.patch'));
      assert.equal(sha(patch),finished.patchHash);
      fs.writeFileSync(path.join(dest,'solution.patch'),patch);
      assert.equal(treeHash(tree),finished.snapshotHash);
    }
    const checks=tools.filter(t=>t.tool==='bash'&&t.state?.input?.command==='node --test').map(t=>({exit:t.state.metadata?.exit,output:t.state.output,truncated:t.state.metadata?.truncated}));
    const bodyHashes=requests.map(r=>({index:r.requestIndex,kind:r.requestKind,forwarded:r.forwarded,complete:r.recording?.evidenceComplete??false,request:r.recording?.clientRequest?.sha256??null,response:r.recording?.response?.sha256??null,usage:r.usage,completion:r.serverCompletion??null}));
    const mission=fs.readFileSync(path.join(root,'stages',start.label,'input/TASK.md'),'utf8');
    assert.equal(sha(mission),start.missionHash);
    const raw=mission,quoted='"'+raw.replaceAll('"','\\"')+'"';
    const missionDeliveries=[];
    for(const r of requests.filter(r=>r.requestKind==='work'&&r.recording?.evidenceComplete)) {
      const request=read(path.join(out,r.recording.clientRequest.file));
      for(const item of request.input.filter(x=>x.role==='user')) {
        const parts=typeof item.content==='string'?[item.content]:item.content?.map(p=>p.text)??[];
        const representation=parts.includes(raw)?'verbatim':parts.includes(quoted)?'opencode-cli-quoted':null;
        if(representation) {missionDeliveries.push({index:r.requestIndex,representation});break;}
      }
    }
    if(finished)assert.ok(missionDeliveries.length,'No recorded mission delivery: '+start.label);
    const deliveredTexts=[];
    const harnessDir=path.join(root,'harnesses',start.label);
    if(finished&&solver&&start.harnessHash!==treeHash({})&&fs.existsSync(harnessDir)) {
      const tree=readTree(harnessDir);
      assert.equal(treeHash(tree),start.harnessHash);
      for(const [name,text] of Object.entries(tree))if(text&&name==='systemprompt.md') {
        const deliveries=requests.filter(r=>r.recording?.clientRequest).filter(r=>fs.readFileSync(path.join(out,r.recording.clientRequest.file),'utf8').includes(JSON.stringify(text.trim()).slice(1,-1))).map(r=>r.requestIndex);
        assert.ok(deliveries.length);deliveredTexts.push({name,text,requestIndexes:deliveries});
      }
      if(['adaptive-k1'].includes(row.name))writeTree(path.join(output,row.name,start.label+'-harness'),tree);
    }
    const stop=optional(path.join(out,'stop-verification.json'));
    stageFacts.push({role:start.role,label:start.label,inputHash:start.inputHash,harnessHash:start.harnessHash,configHash:start.configHash,missionHash:start.missionHash,
      snapshotHash:finished?.snapshotHash,patchHash:finished?.patchHash,
      isolation:container?{network:container.argv[container.argv.indexOf('--network')+1],readOnlyRoot:container.argv.includes('--read-only'),mountTargets:container.argv.filter((_,i)=>container.argv[i-1]==='--mount').map(m=>m.slice(m.indexOf(',target=')+1)),home:'/work/home',dockerSocket:false}:null,
      isolationProbeObserved:tools.some(t=>t.state?.output?.includes('ISOLATION_CHECKED')),cleanBaselineObserved:tools.some(t=>t.state?.output?.includes('CLEAN_BASELINE')),
      completePublicReadObserved:tools.some(t=>t.state?.output?.includes('ALL_PUBLIC_EVIDENCE_READ')),missionDeliveries,deliveredTexts,checks,requests:bodyHashes,
      stop:stop?{terminationVerified:stop.terminationVerified,relayRemoved:stop.relayRemoved,activeProviderHandlers:stop.activeProviderHandlers,forwardingClosed:stop.forwardingClosed,providerServerStateMayRemainUnknown:stop.providerServerStateMayRemainUnknown}:null});
  }
  const result={name:row.name,status:row.status,reason:row.reason??null,independentStatus:row.independentStatus??null,selected:row.selected?{id:row.selected.id,label:row.selected.label,sha256:row.selected.sha256,patchHash:row.selected.patchHash,composition:row.selected.composition,candidateCount:row.selected.candidateCount}:null,
    budget:row.budget,observedUsage:row.observedUsage??null,realModelRequests:row.realModelRequests,
    freeze:{upstream:freeze.upstream,adapterHead:freeze.adapterHead,adapter:freeze.adapter,source:freeze.source,task:freeze.task,image:freeze.image,runtimeBinary:freeze.assets['toolchain/package/bin/opencode'],graph:freeze.graph,surface:freeze.surface,selection:freeze.selection},
    journal:journal.map(e=>({sequence:e.sequence,event:e.event,label:e.label??null,role:e.role??null,harnessHash:e.harnessHash??null,proposalHash:e.proposalHash??null,valid:e.valid??null,reason:e.reason??null})),
    method:fs.existsSync(path.join(root,'upstream-result.json'))?read(path.join(root,'upstream-result.json')):null,stages:stageFacts};
  save(row.name+'.json',result);rows.push({name:row.name,status:row.status,independentStatus:row.independentStatus??null,counts:row.budget.counts,requests:row.budget.requests,elapsedMs:row.budget.elapsedMs});
}
save('index.json',{mechanismChecksPassed:verification.passed,realModelRequests:0,rows});
console.log('Exported public fixture evidence for '+rows.length+' cases');
