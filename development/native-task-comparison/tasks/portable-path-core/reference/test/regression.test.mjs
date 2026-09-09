import {test} from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {normalizePosix} from '../src/posix-path.mjs';import {run} from '../src/cli.mjs';const cliFile=fileURLToPath(new URL('../src/cli.mjs',import.meta.url));
test('POSIX root clamping and trailing slash vectors',()=>{
 for(const [input,expected]of [['','.'],['.','.'],['a/..','.'],['a/../','./'],['/../../a','/a'],['../../a/../b','../../b'],['//a///b//','/a/b/'],['../','../'],['/a/../../','/'],['a/./b/../c','a/c'],['a\\b/../c','c'],['C:\\a\\b','C:\\a\\b'],['a\nb','a\nb']])assert.equal(normalizePosix(input),expected,input);
});
test('wrapper output, arity and writer error identity',()=>{
 const output=[],args=Object.freeze(['a/../b/']);assert.equal(run(args,s=>output.push(s)),0);assert.deepEqual(output,['b/\n']);assert.deepEqual(args,['a/../b/']);
 for(const args of [[],['a','b']]){const out=[];assert.equal(run(args,s=>out.push(s)),2);assert.deepEqual(out,['usage: path <value>\n']);}
 const failure={why:'writer'};assert.throws(()=>run(['a'],()=>{throw failure;}),e=>e===failure);
});
test('invalid input rejects before writing',()=>{
 for(const value of [null,undefined,2,{},'a\0b'])assert.throws(()=>normalizePosix(value),TypeError);
 let writes=0;assert.throws(()=>run(['a\0b'],()=>writes++),TypeError);assert.equal(writes,0);
});
test('actual Node CLI uses same normalized output and status',()=>{
 const result=spawnSync(process.execPath,[cliFile,'/../../x//'],{encoding:'utf8'});assert.equal(result.status,0);assert.equal(result.stdout,'/x/\n');assert.equal(result.stderr,'');
 const usage=spawnSync(process.execPath,[cliFile],{encoding:'utf8'});assert.equal(usage.status,2);assert.equal(usage.stdout,'usage: path <value>\n');
});
