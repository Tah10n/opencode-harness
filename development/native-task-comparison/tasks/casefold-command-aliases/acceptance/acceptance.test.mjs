import {test} from 'node:test';import assert from 'node:assert/strict';
import path from 'node:path';const {createCommands}=await import(path.join(process.env.PILOT_SOURCE,'src/commands.mjs'));
test('exact canonical precedence then folded aliases only',()=>{
 const commands=createCommands([{name:'RUN',aliases:['go'],run:()=>1},{name:'other',aliases:['run'],run:()=>2}]);
 assert.equal(commands.run('RUN'),1);assert.equal(commands.run('run'),2);assert.equal(commands.run('RuN'),2);assert.equal(commands.run('GO'),1);
 assert.throws(()=>commands.run('Other'),e=>e.code==='UNKNOWN_COMMAND');
});
test('collisions refused but same-command folded duplicates allowed',()=>{
 assert.throws(()=>createCommands([{name:'a',aliases:['Go'],run(){}},{name:'b',aliases:['gO'],run(){}}]),e=>e.code==='ALIAS_COLLISION');
 assert.throws(()=>createCommands([{name:'a',run(){}},{name:'a',run(){}}]),e=>e.code==='DUPLICATE_COMMAND');
 const commands=createCommands([{name:'a',aliases:['Go','go'],run:()=>3}]);assert.equal(commands.run('GO'),3);
 const separate=createCommands([{name:'A',run:()=>1},{name:'a',run:()=>2}]);assert.equal(separate.run('A'),1);assert.equal(separate.run('a'),2);
});
test('help order spelling and ownership snapshot',()=>{
 const entries=[{name:'z',description:'last',aliases:['ZZ'],run:()=>1},{name:'a',aliases:[],run:()=>2}];const commands=createCommands(entries);
 entries[0].aliases.push('changed');entries[0].name='modified';const help=commands.help();
 assert.deepEqual(help,[{name:'z',description:'last',aliases:['ZZ']},{name:'a',description:'',aliases:[]}]);
 help[0].aliases.push('bad');help[1].name='bad';assert.equal(commands.help()[1].name,'a');assert.deepEqual(commands.help()[0].aliases,['ZZ']);
 assert.throws(()=>commands.run('changed'),e=>e.code==='UNKNOWN_COMMAND');
});
test('exact arguments return and thrown identities',()=>{
 const value=Promise.resolve(4),token={},failure={why:'handler'};let calls=0;
 const commands=createCommands([{name:'do',aliases:['d'],run:function(...args){calls++;assert.equal(this,undefined);assert.deepEqual(args,[token,undefined]);return value;}},{name:'fail',run(){throw failure;}}]);
 assert.equal(commands.run('D',token,undefined),value);assert.equal(calls,1);assert.throws(()=>commands.run('fail'),e=>e===failure);
});
test('ASCII grammar and special object-like names',()=>{
 const c=createCommands([{name:'__proto__',aliases:['Constructor'],run:()=>7}]);assert.equal(c.run('constructor'),7);assert.equal(c.run('__proto__'),7);
 for(const name of ['', 'a b','é','1bad']){assert.throws(()=>createCommands([{name,run(){}}]),TypeError);assert.throws(()=>c.run(name),TypeError);}
 const frozen=Object.freeze([{name:'x',aliases:Object.freeze(['X1']),run:()=>8}]);assert.equal(createCommands(frozen).run('x1'),8);
});
