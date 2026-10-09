import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function treeHash(root) {
  const rows=[];let bytes=0;
  function walk(dir,prefix='') {for(const name of fs.readdirSync(dir).sort()){
    if(name==='.git')continue;
    const file=path.join(dir,name),relative=prefix+name,stat=fs.lstatSync(file);
    if(stat.isSymbolicLink()||!stat.isDirectory()&&!stat.isFile())throw Error('Unsupported tree entry');
    if(stat.isDirectory())walk(file,relative+'/');
    else {if((bytes+=stat.size)>1048576||rows.length>=256)throw Error('Tree bounds');rows.push([relative,sha(fs.readFileSync(file)),!!(stat.mode&0o111)]);}
  }}walk(root);return sha(JSON.stringify(rows));
}
export function pinInputs(baseline) {
  return {baselineSha256:treeHash(baseline),corpusSha256:sha(fs.readFileSync(path.join(baseline,'compat.json')))};
}
export function validateCorpus(corpus) {
  if(corpus.revision!==1||!Array.isArray(corpus.cases)||!corpus.cases.length||corpus.cases.length>32||typeof corpus.preserved!=='string'||typeof corpus.excluded!=='string')throw Error('Unsupported declaration');
  const ids=new Set();
  for(const c of corpus.cases){if(typeof c.id!=='string'||ids.has(c.id)||!/^[\w./-]+\.mjs$/.test(c.module)||c.module.split('/').some(p=>p==='..'||p==='')||!/^\w+$/.test(c.export)||!Array.isArray(c.args)||JSON.stringify(c.args).length>8192)throw Error('Unsupported scenario');ids.add(c.id);}
}
export function probe({baseline,candidate,pins,snapshotSha256,remainingMs,worker=path.join(import.meta.dirname,'worker.mjs')}) {
  const start=performance.now();
  const result={revision:1,status:'unproven',snapshotSha256,pins,differences:[],limits:[]};
  try {
    if(!fs.existsSync('/.dockerenv'))throw Error('Container required; host project execution refused');
    if(JSON.stringify(pinInputs(baseline))!==JSON.stringify(pins))throw Error('Baseline/corpus integrity mismatch');
    const corpusFile=path.join(baseline,'compat.json'),corpus=JSON.parse(fs.readFileSync(corpusFile));validateCorpus(corpus);
    if(sha(fs.readFileSync(path.join(candidate,'compat.json')))!==pins.corpusSha256)throw Error('Candidate changed declaration/corpus');
    const candidateSha256=treeHash(candidate);result.candidateSha256=candidateSha256;
    const observations=[];
    // Fresh processes plus repeat calls in each realm expose observed instability.
    for(const root of [baseline,baseline,candidate,candidate]) {
      const timeout=Math.floor(Math.min(3000,remainingMs()));if(timeout<=0)throw Error('Task budget exhausted');
      const r=spawnSync('/usr/local/bin/node',['--experimental-vm-modules',worker,root,corpusFile],{encoding:'utf8',timeout,killSignal:'SIGKILL',maxBuffer:262144,env:{PATH:process.env.PATH,NODE_NO_WARNINGS:'1'}});
      if(r.error||r.signal||r.status!==0)throw Error(r.error?.code==='ETIMEDOUT'?'timeout':'Worker execution incomplete: '+JSON.stringify({exit:r.status,signal:r.signal,error:r.error?.code,stderr:r.stderr?.slice(0,500)}));
      const report=JSON.parse(r.stdout);
      if(report.complete!==true||report.rows?.length!==corpus.cases.length||report.rows.some((v,i)=>v.id!==corpus.cases[i].id))throw Error('Incomplete worker observation');
      observations.push(report.rows);
    }
    if(JSON.stringify(pinInputs(baseline))!==JSON.stringify(pins)||treeHash(candidate)!==candidateSha256)throw Error('Inputs changed during probe');
    if(JSON.stringify(observations[0])!==JSON.stringify(observations[1])||JSON.stringify(observations[2])!==JSON.stringify(observations[3]))throw Error('nondeterminism across processes');
    const unsupported=observations.flat().filter(r=>r.status!=='observed');
    if(unsupported.length){result.status=unsupported.some(r=>r.status==='unproven')?'unproven':'unsupported';result.limits=[...new Set(unsupported.map(r=>r.reason))];}
    else {
      result.status='matched';
      for(let i=0;i<corpus.cases.length;i++)if(JSON.stringify(observations[0][i].behavior)!==JSON.stringify(observations[2][i].behavior)){
        const c=corpus.cases[i];result.differences.push({id:c.id,entrypoint:c.module+'#'+c.export,input:c.args,baseline:observations[0][i].behavior,candidate:observations[2][i].behavior,snapshotSha256,candidateSha256,reproduction:{worker,baseline,candidate,corpus:corpusFile,caseId:c.id}});
      }
      if(result.differences.length)result.status='different';
      if(JSON.stringify(result.differences).length>12000){result.status='unproven';result.differences=[];result.limits.push('Difference exceeds compact feedback bound');}
    }
  }catch(error){result.limits.push(error.message);}
  result.elapsedMs=performance.now()-start;return result;
}
export function addObservation(facts,result,snapshotSha256) {
  const out={...facts,reasons:[...facts.reasons],correctionReasons:[...(facts.correctionReasons??facts.reasons)],limits:[...facts.limits],compatReplay:result};
  if(result.snapshotSha256!==snapshotSha256){out.limits.push('Compatibility probe snapshot is stale');return out;}
  if(result.status==='different'&&result.differences.length){
    const reason='Preserved behavior differs on fixed baseline calls: '+result.differences.map(d=>d.entrypoint+' case '+d.id).join(', ');
    out.reasons.push(reason);out.correctionReasons.push(reason);
  }else if(result.status!=='matched')out.limits.push('Compatibility probe '+result.status+': '+result.limits.join('; '));
  return out;
}
