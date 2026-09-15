// Development data only. Never imported by the installed runtime.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {materializeNativeTemplate} from '../../lib/native-template.mjs';
import {startContainer} from '../native-task-ab/container-session.mjs';
import {stopWorkload} from '../native-task-utility/container/stop-workload.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const local = path.join(root, 'local/native-sensitivity');
const historical = path.join(root, 'local/native-task-h00-transfer');
fs.mkdirSync(local, {recursive:true});
const bundle = path.join(local, 'bundle');
if (!fs.existsSync(bundle)) {
  materializeNativeTemplate({repositoryRoot:root, outputDirectory:bundle, task:true});
  fs.cpSync(path.join(root,'profiles/native/sensitivity/node_modules'), path.join(bundle,'sensitivity/node_modules'), {recursive:true,verbatimSymlinks:true});
} else {
  for (const name of ['native-sensitivity.mjs','native-sensitivity-runner.mjs','native-project-scope.mjs','native-task-observations.mjs'])
    fs.copyFileSync(path.join(root,'lib',name),path.join(bundle,name));
}
const cases = [
  {id:'weak-computed',task:'quick-lru-computed',patch:'continuation-20260914/patches/37-quick-lru-computed-r2-H00.patch',command:'node_modules/.bin/ava',gap:'default TTL of computed insertion'},
  {id:'weak-remove',task:'denque-remove-where',patch:'continuation-20260914/patches/27-denque-remove-where-r2-P.patch',command:'node_modules/.bin/mocha',gap:'configured capacity preserved after removal'},
  {id:'control-computed',task:'quick-lru-computed',patch:'patches/14-quick-lru-computed-r1-H00.patch',command:'node_modules/.bin/ava'},
  {id:'control-remove',task:'denque-remove-where',patch:'continuation-20260914/patches/28-denque-remove-where-r2-H00.patch',command:'node_modules/.bin/mocha'},
];
const toolchain = JSON.parse(fs.readFileSync(path.join(historical,'freeze.json'))).toolchain;
const strengthen = process.argv.includes('--strengthen');
for (const original of cases.filter(r => !strengthen || r.id === 'weak-remove')) {
  const row = {...original, ...(strengthen ? {id:'strong-remove'} : {})};
  const output = path.join(local,row.id);
  if (fs.existsSync(output)) throw Error('Refusing to replace retained local observation: '+output);
  fs.mkdirSync(output);
  let session;
  try {
    session = await startContainer({source:path.join(historical,'inputs',row.task),toolchain,template:bundle,output:path.join(output,'container'),onRequest(){throw Error('Model requests forbidden in local admission');}});
    const patch=fs.readFileSync(path.join(root,'development/native-task-h00-transfer',row.patch),'utf8');
    const prep=session.exec(['node','-e',`require('fs').writeFileSync('/work/input.patch',${JSON.stringify(patch)})`]);
    if(prep.status!==0)throw Error(prep.stderr);
    const apply=session.exec(['git','apply','/work/input.patch']);if(apply.status!==0)throw Error(apply.stderr);
    if (strengthen) {
      const test = "var assert = require('assert'); var Denque = require('../');\ndescribe('removeWhere on an empty queue', function () {\n  it('does not invoke the predicate and remains reusable', function () {\n    var queue = new Denque([], {capacity: 2});\n    assert.strictEqual(queue.removeWhere(function () { throw new Error('No original entries to visit'); }), 0);\n    queue.push('a'); queue.push('b'); queue.push('c');\n    assert.deepStrictEqual(queue.toArray(), ['b', 'c']);\n  });\n});\n";
      const added = session.exec(['node','-e',`require('fs').writeFileSync('test/sensitivity-regression.js',${JSON.stringify(test)})`]);if(added.status!==0)throw Error(added.stderr);
      fs.writeFileSync(path.join(output,'regression.js'),test);
    }
    const script=`import fs from 'node:fs';import {sensitivityPlan} from '/template/native-sensitivity.mjs';import {runSensitivity} from '/template/native-sensitivity-runner.mjs';const rules=[{permission:'*',pattern:'*',action:'allow'}];const command=${JSON.stringify('harness-sense index.js "'+row.command+'"')};let report;try{const plan=sensitivityPlan({directory:'/work/repo',rules,command});report=await runSensitivity({script:command,rules,base:'HEAD',snapshot:plan.snapshot,budgetMs:180000});}catch(e){report={status:'not-run',reason:e.message}}fs.writeFileSync('/work/report.json',JSON.stringify(report));console.log(JSON.stringify(report));`;
    const prepare=session.exec(['node','-e',`require('fs').writeFileSync('/work/check.mjs',${JSON.stringify(script)})`]);if(prepare.status!==0)throw Error(prepare.stderr);
    const child=spawn('docker',['exec','--workdir','/work/repo',session.name,'node','/work/check.mjs'],{stdio:['ignore','pipe','pipe']});
    const log=fs.createWriteStream(path.join(output,'output.txt'));child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    const timer=setTimeout(()=>{stopWorkload(session);child.kill('SIGTERM');},200000);
    const completed=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(exit,signal)=>resolve({exit,signal}));});
    clearTimeout(timer);await new Promise(r=>log.end(r));
    const capture=session.exec(['cat','/work/report.json']);
    const report=capture.status===0?JSON.parse(capture.stdout):{status:'unavailable',captureExit:capture.status};
    const result={...row,...completed,report,realProviderRequests:0,termination:stopWorkload(session)};
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({id:row.id,status:report.status,reason:report.reason,baseline:report.baseline?.status,variants:report.variants?.map(m=>({operator:m.mutatorName,replacement:m.replacement,status:m.status})),cost:report.cost}));
  } finally {if(session&&session.close()!==0)throw Error('Container cleanup failed');}
}
