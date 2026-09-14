// Post-stop evaluator only: reproduce the exact saved standard variant, never author input.
import fs from 'node:fs';
import path from 'node:path';
import {projectCheck} from '../../native-task-ab/project-check.mjs';
const root=path.resolve(process.argv[2]);
const f=JSON.parse(fs.readFileSync(root+'/freeze.json'));
for(const a of f.attempts){const s=JSON.parse(fs.readFileSync(root+'/runs/'+a.task+'-'+a.arm+'/stop-verification.json'));if(!s.terminationVerified||!s.relayRemoved||s.activeProviderHandlers)throw Error('Stop unverified');}
const report=JSON.parse(fs.readFileSync(root+'/checks/case-1/offline-sensitivity.json'));
const variant=report.variants.find(v=>v.mutatorName==='BooleanLiteral'&&v.replacement==='true');
if(!variant||variant.status!=='passed')throw Error('Expected recorded ordinary variant unavailable');
const probe=`const assert=require('node:assert/strict');const Denque=require('./');let calls=0;const removed=new Denque().removeWhere(()=>{calls++;return false;});console.log(JSON.stringify({calls,removed}));assert.equal(calls,0,'an empty queue has no original values: predicate must never run');assert.equal(removed,0);`;
const code=`const fs=require('fs'),cp=require('child_process'),assert=require('node:assert/strict');let p=cp.spawnSync('git',['apply','.delivery.patch'],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);fs.writeFileSync('.probe.cjs',${JSON.stringify(probe)});const check=()=>cp.spawnSync(process.execPath,['.probe.cjs'],{encoding:'utf8'});let correct=check();console.log('correct',correct.stdout);assert.equal(correct.status,0,correct.stderr);let text=fs.readFileSync('index.js','utf8'),lines=text.split('\\n'),v=${JSON.stringify(variant.location)};assert.equal(v.start.line,v.end.line);let line=lines[v.start.line-1];assert.equal(line.slice(v.start.column,v.end.column),'false');lines[v.start.line-1]=line.slice(0,v.start.column)+'true'+line.slice(v.end.column);fs.writeFileSync('index.js',lines.join('\\n'));let mutant=check();console.log('recorded variant',mutant.stdout,mutant.stderr);assert.equal(mutant.status,1);assert.match(mutant.stderr,/an empty queue has no original values/);assert.match(mutant.stdout,/"calls":4/);`;
const patch=fs.readFileSync(root+'/checks/case-1/verified.patch');
const result=await projectCheck({source:f.attempts[0].source,toolchain:f.toolchain,output:root+'/checks/counterexample',overlay:{'.delivery.patch':patch.toString('base64'),'.check.cjs':Buffer.from(code).toString('base64')},command:['node','.check.cjs']});
if(result.exit!==0)throw Error('Counterexample check failed; inspect retained output');
console.log(JSON.stringify(result));
