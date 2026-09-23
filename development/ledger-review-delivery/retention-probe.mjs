import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {adapterFor} from '/workspace/packages/connector/lib/readers.mjs';import {maximumEventLedgerEntries,maximumEventLedgerBytes} from '/workspace/packages/connector/lib/adapters/shared.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'selected-ledger-')),range={rangeStart:'2026-07-15',rangeEnd:'2026-08-14'},a=adapterFor('antigravity'),round=x=>JSON.parse(JSON.stringify(x));
const record=(id,amount)=>({id,date:'2026-08-10',usage:{input_tokens:amount,output_tokens:0}}),total=r=>r.entries.reduce((v,e)=>v+BigInt(e.totalTokens),0n),summary=r=>({totalDigits:total(r).toString().length,totalSha256:createHash('sha256').update(total(r).toString()).digest('hex'),completeness:r.completeness,diagnostics:r.diagnostics,events:Object.keys(r.nextState.eventLedger.events).length,ledgerBytes:Buffer.byteLength(JSON.stringify(r.nextState.eventLedger.events))});
const emit=x=>console.log(JSON.stringify(x));
try{
 const dir=path.join(root,'bound');await fs.mkdir(dir);let f=path.join(dir,'capture-start.jsonl');const s={dataPath:dir},amount='9'.repeat(250000),unit=BigInt(amount);let state={},last=0n,saturated=false;emit({case:'retention-bound-parameters',maximumEventLedgerEntries,maximumEventLedgerBytes,inputDigits:amount.length});
 for(let i=0;i<100;i++){
  await fs.rm(f,{force:true});f=path.join(dir,'capture-'+i+'.jsonl');await fs.writeFile(f,JSON.stringify(record('event-'+i,amount))+'\n');const r=await a.collect(s,range,round(state));const value=total(r);emit({case:'bound-step',index:i,...summary(r),nondecreasing:value>=last,expectedAllObserved:value===unit*BigInt(i+1)});last=value;state=round(r.nextState);
  if(r.completeness==='partial'&&r.diagnostics.some(x=>x.code==='local_store_scan_limit')){saturated=true;break;}
 }
 assert.ok(saturated,'Actual bound not reached within declared fixture resources');
 await fs.unlink(f);let r=await a.collect(s,range,round(state));emit({case:'after-bound-delete',...summary(r),acceptedUsageRetained:total(r)===last});state=round(r.nextState);
 await fs.writeFile(path.join(dir,'moved.jsonl'),JSON.stringify(record('event-0',amount))+'\n');r=await a.collect(s,range,round(state));emit({case:'after-bound-old-replay',...summary(r),noRecount:total(r)===last});state=round(r.nextState);
 await fs.writeFile(path.join(dir,'moved.jsonl'),JSON.stringify(record('brand-new','1'))+'\n');r=await a.collect(s,range,round(state));emit({case:'after-bound-new',...summary(r),atLeastPreviouslyAccepted:total(r)>=last});
}finally{await fs.rm(root,{recursive:true,force:true});}
