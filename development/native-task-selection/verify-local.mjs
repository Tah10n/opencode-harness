import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assessDecision} from './decision.mjs';
import {runSelector} from './phases.mjs';
const record=(X,Y)=>`RESULT behavior | required public behavior | X=${X} | Y=${Y} | X: public consumer code and assertions; Y: public consumer code and assertions`;
const cases=[['confirmed','missing','X'],['missing','confirmed','Y'],['confirmed','confirmed','X'],['confirmed','confirmed','Y'],['missing','missing','NEITHER'],['unverified','missing','INSUFFICIENT'],['unverified','confirmed','Y']];
for(const [X,Y,d]of cases){assert.equal(assessDecision(record(X,Y)+'\nDECISION: '+d).consistent,true);for(const wrong of ['X','Y','NEITHER','INSUFFICIENT'].filter(x=>x!==d&&!(X==='confirmed'&&Y==='confirmed'&&['X','Y'].includes(x))))assert.equal(assessDecision(record(X,Y)+'\nDECISION: '+wrong).consistent,false);}
const suite=record('confirmed','confirmed')+'\nRESULT consumer | delivered consumer case | X=missing | Y=confirmed | X: supplied tests lack required case despite green suite; Y: delivered public consumer call and assertions';
assert.equal(assessDecision(suite+'\nDECISION: X').consistent,false);
assert.equal(assessDecision(suite+'\nDECISION: Y').consistent,true);
assert.equal(assessDecision('Test present; 999 assertions pass\nDECISION: X').consistent,false);
assert.equal(assessDecision(record('confirmed','confirmed')+'\nDECISION: X').semanticValidity,'unverified');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'selection-branches-'));
try{
 for(const mode of ['early','reserve','deadline','invalid-no-repair','unknown','cancel','late-cancel']){
  let time=0,calls=0,cancelled=false;const out=path.join(dir,mode);fs.mkdirSync(out);
  const text=record('confirmed','missing')+'\nDECISION: X';
  const result=await runSelector({output:out},{config:{},limitMs:300,researchMs:240,canFinalize:()=>mode!=='cancel'&&!cancelled,beforeFinal:async()=>{if(mode==='late-cancel')cancelled=true;}},{now:()=>time,phase:async(s,o)=>{
   calls++;if(calls===2){assert.equal(o.sessionID,'same');assert.ok(Object.values(o.config.tools).every(v=>v===false));time=mode==='deadline'?300:280;return {exitCode:0,timedOut:mode==='deadline',parseErrors:0,termination:{terminationVerified:true},events:[{type:'text',sessionID:'same',part:{text}},{type:'step_finish',part:{reason:'stop'}}]};}
   time=mode==='early'||mode==='invalid-no-repair'?30:240;
   return {exitCode:mode==='unknown'?1:0,timedOut:['reserve','deadline','cancel'].includes(mode),parseErrors:0,termination:{terminationVerified:mode!=='unknown'},events:[{type:'text',sessionID:'same',part:{text:mode==='early'?text:mode==='invalid-no-repair'?record('missing','confirmed')+'\nDECISION: X':'Research observations only'}},{type:'step_finish',part:{reason:'stop'}}]};
  }});
  assert.equal(result.decision,['early','reserve'].includes(mode)?'X':null,mode);
  assert.equal(calls,['reserve','deadline'].includes(mode)?2:1,mode);
 }
}finally{fs.rmSync(dir,{recursive:true});}
console.log(JSON.stringify({branchCases:cases.length,greenSuiteMissingConsumer:true,reservedDecision:true,deadlineWithoutDecision:true,unknownAndCancellationStop:true,semanticCorrectness:'not established',realProviderCalls:0}));
