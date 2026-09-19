import assert from 'node:assert/strict';
import {createPreservationNudge, advisoryCommand, mochaReport} from '../lib/native-preservation-nudge.mjs';
const base={snapshotSha256:'base',diff:''};
const diff=(p,text='new')=>`diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n-old\n+${text}\n`;
const snapshot={snapshotSha256:'edited',diff:diff('index.js')+diff('test/feature.test.js')};
const tap='TAP version 13\n# Subtest: feature\nok 1 - feature\n  ---\n  duration_ms: 1\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 5\n';
const args={command:'node --test test/feature.test.js',workdir:'.'};
const event={tool:'bash',callID:'run',before:'edited',after:'edited',startedAt:1,completedAt:2,executionAdmitted:true,state:'completed',exit:0,args,admittedArgs:args,output:tap};
const edit={tool:'apply_patch',before:'base',after:'edited'};
const pkg={scripts:{test:'node --test'}};
let checks=0;
function fixture({active=()=>true,remainingMs=()=>200000,changed=false,deny=false}={}) {
  const files=new Map([['package.json',JSON.stringify(pkg)],['test/old.test.js',"const test = require('node:test'), api = require('../index'); test('old',()=>{});"],['test/feature.test.js',"const test = require('node:test'), api = require('../index'); test('feature',()=>{});"]]);
  const originals=new Map([['test/old.test.js',files.get('test/old.test.js')]]);
  if(changed) originals.set('test/feature.test.js',"test('feature',()=>{});\n// original comment\n");
  return createPreservationNudge({directory:'/project',initial:base,save(){},active,remainingMs,inputs:{
    read:p=>{if(deny)throw Error('denied');return files.get(p)??null;},initialFiles:new Set(['package.json','index.js',...originals.keys()]),originals,packages:new Map([['.',pkg]]),packageBytes:new Map([['.',JSON.stringify(pkg)]]),npmConfigs:new Map([['.',null]])}});
}
const run=(options={},e=event,s=snapshot,history=[edit,e])=>fixture(options).after(e,s,history);
assert.match(run(),/Preservation advisory/);checks++;
for(const options of [{active:()=>false},{remainingMs:()=>119999},{changed:true},{deny:true}]) {assert.equal(run(options),null);checks++;}
for(const delta of [{exit:1},{executionAdmitted:false},{state:'error'},{timeout:true},{after:'changed'},{admittedArgs:{}},{output:tap.replace('# tests 1','# tests 0')},{output:tap.replace('# skipped 0','# skipped 1')},{output:'1 passing'},{output:tap.slice(0,-30)}]) {const e={...event,...delta};assert.equal(run({},e),null);checks++;}
assert.equal(run({},event,{snapshotSha256:'edited',diff:diff('test/feature.test.js')}),null);checks++;
assert.equal(run({},event,snapshot,[event]),null);checks++;
const f=fixture(), first=f.after(event,snapshot,[edit,event]);f.attached('run',first);assert.equal(f.after(event,snapshot,[edit,event]),null);assert.equal(f.state.attachedBlocks,1);checks++;
assert.match(fixture().after(event,snapshot,[edit,event]),/Preservation advisory/);checks++;
for(const command of ["echo '4 passing'",'npm test -- --grep abc | cat','npm test -- --grep abc && true','unknown test','node --test test/feature.test.js || true']) {assert.equal(advisoryCommand(command),null);checks++;}
assert.deepEqual(mochaReport('\n  alpha\n    ✓ one\n\n  beta\n    ✓ one\n\n  2 passing (1ms)\n'),[{suite:'alpha',name:'one'},{suite:'beta',name:'one'}]);checks++;
for(const output of ['  0 passing (1ms)\n','  1 passing (1ms)\n','  a\n    - one\n  0 passing (1ms)\n  1 pending\n','  a\n    ✓ one\n']) {assert.equal(mochaReport(output),null);checks++;}
console.log(JSON.stringify({passed:true,checks,realProviderCalls:0}));
// Same-scope current old execution suppresses only this advisory condition.
const oldArgs={command:'node --test test/old.test.js',workdir:'.'};
const oldEvent={...event,callID:'old',args:oldArgs,admittedArgs:oldArgs,output:tap.replaceAll('feature','old')};
assert.equal(run({},event,snapshot,[edit,oldEvent,event]),null);
const stale={...oldEvent,before:'base',after:'base'};
assert.match(run({},event,snapshot,[stale,edit,event]),/Preservation advisory/);
const baselineFailure={...stale,exit:1};
assert.match(run({},event,snapshot,[baselineFailure,edit,event]),/Preservation advisory/);
const spec='✔ feature (0.25ms)\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 5\n';
assert.match(run({},{...event,output:spec}),/Preservation advisory/);
let calls=0;
const cancelledAtAttachment=fixture({active:()=>++calls===1});
assert.equal(cancelledAtAttachment.after(event,snapshot,[edit,event]),null);
assert.equal(cancelledAtAttachment.state.attachedBlocks,0);
console.log(JSON.stringify({additionalControls:5,passed:true}));
// A generic directory-driven Mocha layout, independent of the historical project.
const mochaPkg={name:'widgets',version:'1.0.0',scripts:{test:'mocha --opts mocha.opts',pretest:'npm run build',build:'node build.js && rollup -c'}};
const mochaFiles=new Map([
 ['package.json',JSON.stringify(mochaPkg)],['mocha.opts','test/test.js'],['build.js','// build'],['rollup.config.js','// recipe'],
 ['test/test.js',`glob.sync("*/index.js", { cwd: "test" }).forEach(function(file) { require("./" + file); });`],
 ...['screen','server'].map(s=>['test/'+s+'/index.js',`describe('${s}',()=>{ fs.readdirSync('test/cases').forEach(dir=>{ (true ? it : it)(dir,()=>{}); }); });`]),
 ['test/cases/existing/main.js','// retained case'],['test/cases/extension/main.js','// new feature']]);
const mochaInitial=new Set([...mochaFiles.keys()].filter(p=>!p.includes('/extension/')));
const mochaOriginals=new Map([...mochaFiles].filter(([p])=>p.startsWith('test/')&&mochaInitial.has(p)));
const makeMocha=()=>createPreservationNudge({directory:'/project',initial:base,active:()=>true,remainingMs:()=>200000,save(){},inputs:{read:p=>mochaFiles.get(p)??null,initialFiles:mochaInitial,originals:mochaOriginals,packages:new Map([['.',mochaPkg]]),packageBytes:new Map([['.',JSON.stringify(mochaPkg)]]),npmConfigs:new Map([['.',null]])}});
const mochaEvent=(id,filter,rows)=>{const args={command:"npm test -- --grep '"+filter+"'",workdir:'.'};return {...event,callID:id,args,admittedArgs:args,output:'> node build.js && rollup -c\ncreated build.js in 1ms\n> widgets@1.0.0 test\n> mocha --opts mocha.opts --grep '+filter+'\n\n'+rows+'\n  '+(rows.match(/✓/g)||[]).length+' passing (1ms)\n'};};
const mSnapshot={snapshotSha256:'edited',diff:diff('index.js')+diff('test/cases/extension/main.js')};
const feature=mochaEvent('feature','extension','  screen\n    ✓ extension\n  server\n    ✓ extension\n');
const server=mochaEvent('server','existing','  server\n    ✓ existing\n');
const screen=mochaEvent('screen','existing','  screen\n    ✓ existing\n');
const partial=makeMocha().after(feature,mSnapshot,[edit,server,feature]);assert.match(partial,/screen: extension/);assert.ok(!partial.includes('server: extension'));
assert.equal(makeMocha().after(feature,mSnapshot,[edit,server,screen,feature]),null);
assert.match(makeMocha().after(feature,mSnapshot,[edit,feature]),/Preservation advisory/);
const changedConfig=makeMocha();mochaFiles.set('rollup.config.js','// changed recipe');assert.equal(changedConfig.after(feature,mSnapshot,[edit,feature]),null);
console.log(JSON.stringify({mochaScopeControls:4,passed:true}));

assert.equal(run({},{...event,output:tap.replace('# tests 1','# tests 0\n# tests 1')}),null);
console.log(JSON.stringify({contradictoryTapControl:true,passed:true}));
