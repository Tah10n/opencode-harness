// Post-hoc diagnostic of the already-declared preservation contract.
// Does not modify the frozen evaluator or delivered patches.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const root=path.resolve('local/native-command-hints-comparison/batch'),out=root+'/type-compatibility';fs.mkdirSync(out);
const fixture=`import E from './index';
const e = new E<{ value: [string] }, { prefix: string }>();
const callback = (value: string) => { void value.length; };
e.on('value', callback, { prefix: 'value:' });
// The registered arrow callback ignores its receiver and is safe to call directly.
const sameCallback = e.listeners('value')[0];
sameCallback('hello');
`;
const rows=[];
for(const id of ['baseline','reference','n03','n04']){
 const dir=out+'/'+id;fs.mkdirSync(dir);fs.copyFileSync(root+(id==='reference'?'/calibration/B/reference':'/inputs/B')+'/index.d.ts',dir+'/index.d.ts');
 if(id.startsWith('n')){assert.equal(spawnSync('git',['init','-q'],{cwd:dir}).status,0);const r=spawnSync('git',['apply','--include=index.d.ts',root+'/neutral/'+id+'.patch'],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 fs.writeFileSync(dir+'/consumer.ts',fixture);
 const r=spawnSync(process.execPath,[root+'/bundle/node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--target','es2020','--module','commonjs','--moduleResolution','node','--ignoreDeprecations','6.0','consumer.ts'],{cwd:dir,encoding:'utf8'});
 rows.push({id,status:r.status,output:r.stdout+r.stderr});assert.equal(r.status,id.startsWith('n')?2:0,r.stdout+r.stderr);
}
fs.writeFileSync(out+'/result.json',JSON.stringify({kind:'post-hoc existing public type compatibility',compiler:'prepared TypeScript 6.0.3, Node host; declaration-only, not an additional Linux runtime claim',fixture,rows},null,2)+'\n');console.log(JSON.stringify(rows,null,2));
