import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const project=process.env.FEEDBACK_PROJECT_ROOT;
const load=name=>import(pathToFileURL(path.join(project,name)).href);
const {runCLI}=await load('src/cli.mjs');
const {parseArgs}=await load('src/args.mjs');
const rows=[{id:'a',name:'A',tags:['other']},{id:'b',name:'B',tags:['wanted']},{id:'c',name:'C',tags:['wanted']}];
test('fd02.filter-before-limit',()=>{
 const before=structuredClone(rows);
 assert.equal(runCLI(rows,['--limit','1','--tag','wanted']),'b: B');
 assert.deepEqual(JSON.parse(runCLI(rows,['--tag','wanted','--json','--limit','2'])),rows.slice(1));
 assert.equal(runCLI(rows,['--limit','0']),'');
 assert.equal(runCLI(rows,['--limit','0','--limit','3']),'a: A\nb: B\nc: C');
 assert.deepEqual(rows,before);
});
test('fd02.limit-validation',()=>{
 for(const raw of [undefined,'-1','+1','1.5',' 1','01','x','9007199254740992']) assert.throws(()=>parseArgs(raw===undefined?['--limit']:['--limit',raw]));
 assert.equal(parseArgs(['--limit','2']).limit,2);
});
test('fd02.original-cli-contracts',()=>{
 assert.equal(runCLI(rows,[]),'a: A\nb: B\nc: C');
 assert.equal(runCLI(rows,['--tag','wanted','--tag','other']),'a: A');
 assert.deepEqual(JSON.parse(runCLI(rows,['--json'])),rows);
 assert.throws(()=>parseArgs(['--tag'])); assert.throws(()=>parseArgs(['--wat']));
});
