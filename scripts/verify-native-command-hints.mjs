// Model-free controls: actual Bash failures, permitted metadata, no hidden execution.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createCommandHints, commandHintRequest, commandHintLimits} from '../lib/native-command-hints.mjs';
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'command-hints-')));
const rules = [{permission:'*',pattern:'*',action:'allow'}];
const write = (p,v) => {fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v);};
const json = (p,v) => write(p,JSON.stringify(v));
const install = (dir, version='10.33.2', manager='pnpm') => {
 const pkg=path.join(dir,'node_modules',manager),bin=path.join(dir,'node_modules/.bin',manager);
 json(path.join(pkg,'package.json'),{name:manager,version,bin:{[manager]:'bin/cli.cjs'}});
 write(path.join(pkg,'bin/cli.cjs'),'#!/bin/bash\nexit 127\n');fs.chmodSync(path.join(pkg,'bin/cli.cjs'),0o755);
 fs.mkdirSync(path.dirname(bin),{recursive:true});fs.symlinkSync('../'+manager+'/bin/cli.cjs',bin);
};
let tests=0;
function setup(name, options={}) {
 const dir=path.join(temp,name);fs.mkdirSync(dir,{recursive:true});
 json(path.join(dir,'package.json'),{scripts:{test:'node --test',lint:'eslint .'},packageManager:'pnpm@10.33.2'});
 const empty=path.join(dir,'empty');fs.mkdirSync(empty);
 const saved=[];let live=true;
 const hints=createCommandHints({directory:dir,rules,env:{PATH:empty},active:()=>live,save:(name,value)=>saved.push({name,value}),...options});
 const args={command:'pnpm test',description:'check'};
 const shell={env:{}};
 const pre=hints.before(args,{cwd:dir},shell);
 const result=spawnSync('/bin/bash',['-c',args.command],{cwd:dir,env:{PATH:empty},encoding:'utf8'});
 assert.equal(result.status,127);
 const event={tool:'bash',state:'completed',executionAdmitted:true,args,admittedArgs:args,exit:result.status,output:result.stdout+result.stderr,callID:'one'};
 return {dir,empty,hints,args,pre,event,saved,shell,cancel:()=>{live=false;}};
}
function check(name,fn){fn();tests++;console.log('PASS '+name);}
try {
 check('narrow grammar',()=>{
  for(const c of ['pnpm test','pnpm run test -- --reporter=dot','npm test','npm run lint','pnpm lint']) assert.ok(commandHintRequest(c),c);
  for(const c of ['pnpm test; echo ok','pnpm test | cat','pnpm test > x','pnpm $(echo test)','pnpm `echo test`','npm exec vitest','npx vitest','PATH=x pnpm test','pnpm\ntest','pnpm --dir x test','npm lint','npm test -w project','npm run test --prefix=/other','echo command not found']) assert.equal(commandHintRequest(c),null,c);
 });
 check('real bare failure -> metadata route; delayed completion; raw failure unchanged',()=>{
  const f=setup('found');install(f.dir); // Resolution is deliberately current, after the native error.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,85);
  const raw=f.event.output,context=f.hints.after(f.event,f.pre);assert.ok(context,JSON.stringify(f));
  const h=f.saved[0].value;assert.equal(h.status,'path-found');assert.equal(h.installed.version,'10.33.2');assert.equal(h.cost.executions,0);
  assert.equal(f.event.output,raw);assert.equal(f.event.exit,127);assert.equal(h.routes.length,1);assert.match(h.notice,/has not run/);
  assert.ok(h.cost.paths<=commandHintLimits.paths);assert.ok(h.cost.bytes<=commandHintLimits.bytes);
  assert.equal(f.hints.after({...f.event,callID:'two'},f.pre),null);assert.equal(f.saved.length,1);
  const orig=fs.lstatSync;let probes=0;fs.lstatSync=(...a)=>{probes++;return orig(...a);};
  try{for(const callID of ['parallel-a','parallel-b']){assert.equal(f.hints.before(f.args,{cwd:f.dir},f.shell),null);assert.equal(f.hints.after({...f.event,callID},f.pre),null);}assert.equal(probes,0);}finally{fs.lstatSync=orig;}
 });
 for(const [name,change] of Object.entries({works:{exit:0},type:{exit:2,output:'error TS2322'},lint:{exit:1},nested:{output:'/bin/bash: line 1: eslint: command not found\n'},fake:{output:'test printed command not found\n'},denied:{permissionDenied:true},cancelled:{state:'error'},unadmitted:{executionAdmitted:false},signal:{signal:'SIGTERM'},timeout:{timeout:true},wrongShell:{output:'zsh: command not found: pnpm\n'},unknownShell:{output:'pnpm: command not found\n'}})) check(name,()=>{const f=setup(name);assert.equal(f.hints.after({...f.event,...change},f.pre),null);assert.equal(f.saved.length,0);});
 check('executable itself prints exact diagnostic and exits 127',()=>{
  const f=setup('spoof');write(path.join(f.empty,'pnpm'),'#!/bin/bash\necho "/bin/bash: line 1: pnpm: command not found" >&2\nexit 127\n');fs.chmodSync(path.join(f.empty,'pnpm'),0o755);
  const pre=f.hints.before(f.args,{cwd:f.dir},f.shell);assert.equal(pre,null);
  const r=spawnSync('/bin/bash',['-c','pnpm test'],{env:{PATH:f.empty},encoding:'utf8'});assert.equal(r.status,127);assert.equal(f.hints.after({...f.event,output:r.stderr},pre),null);
 });
 check('cache-only is unavailable',()=>{const f=setup('cache');fs.mkdirSync(path.join(f.dir,'node_modules/.cache'),{recursive:true});f.hints.after(f.event,f.pre);assert.equal(f.saved[0].value.status,'unavailable');assert.deepEqual(f.saved[0].value.routes,[]);});
 check('metadata mismatch no fallback',()=>{const f=setup('mismatch');install(f.dir,'9.0.0');f.hints.after(f.event,f.pre);assert.equal(f.saved[0].value.status,'unavailable');assert.match(f.saved[0].value.reason,/nearest/);});
 check('ordered ancestor and real local precedence',()=>{
  const parent=path.join(temp,'ancestor');fs.mkdirSync(parent);install(parent);
  const a=setup('ancestor/nested',{originalDirectory:parent});a.hints.after(a.event,a.pre);assert.equal(a.saved[0].value.installed.executable,path.join(parent,'node_modules/.bin/pnpm'));
  const b=setup('ancestor/local',{originalDirectory:parent});install(b.dir,'9.0.0');b.hints.after(b.event,b.pre);assert.equal(b.saved[0].value.status,'unavailable');
 });
 check('denied symlink target is not read or exposed',()=>{
  const secret=path.join(temp,'forbidden');fs.mkdirSync(secret);json(path.join(secret,'package.json'),{sentinel:'DO_NOT_READ'});
  const f=setup('deny',{rules:[...rules,{permission:'read',pattern:secret+'*',action:'deny'}]});
  fs.mkdirSync(path.join(f.dir,'node_modules/.bin'),{recursive:true});fs.symlinkSync(path.join(secret,'cli'),path.join(f.dir,'node_modules/.bin/pnpm'));
  const orig=fs.lstatSync;const observed=[];fs.lstatSync=(p,...a)=>{observed.push(p);return orig(p,...a);};
  try{f.hints.after(f.event,f.pre);}finally{fs.lstatSync=orig;}
  assert.ok(!observed.some(p=>p.startsWith(secret)));assert.ok(!JSON.stringify(f.saved).includes(secret));assert.match(f.saved[0].value.reason,/permitted/);
 });
 check('cwd mismatch',()=>{const f=setup('cwd');assert.equal(f.hints.before(f.args,{cwd:temp},f.shell),null);assert.equal(f.hints.after({...f.event,args:{...f.args,workdir:temp}},f.pre),null);});
 check('untracked PATH change suppresses stale evidence',()=>{const f=setup('changed');write(path.join(f.empty,'pnpm'),'new executable');assert.equal(f.hints.after(f.event,f.pre),null);});
 check('script and dependencies read at completion, not cached',()=>{const f=setup('current');install(f.dir);json(path.join(f.dir,'package.json'),{scripts:{lint:'true'}});f.hints.after(f.event,f.pre);assert.equal(f.saved[0].value.script,null);assert.equal(f.saved[0].value.status,'unavailable');});
 check('changed shell env',()=>{const f=setup('env');f.shell.env.PATH='/unknown';assert.equal(f.hints.after(f.event,f.pre),null);});
 check('late shell startup/function injection suppresses evidence',()=>{for(const name of ['BASH_ENV','ENV','BASH_FUNC_pnpm%%']){const f=setup('late-'+name.replace(/[^a-zA-Z]/g,''));f.shell.env[name]='injected';assert.equal(f.hints.after(f.event,f.pre),null);}});
 check('cancel/deadline no reads',()=>{const f=setup('cancel');f.cancel();const orig=fs.lstatSync;fs.lstatSync=()=>assert.fail('late read');try{assert.equal(f.hints.after(f.event,f.pre),null);assert.equal(f.hints.before(f.args,{cwd:f.dir},f.shell),null);}finally{fs.lstatSync=orig;}});
 check('oversized metadata bounded',()=>{const f=setup('large');write(path.join(f.dir,'package.json'),' '.repeat(commandHintLimits.metadata+1));f.hints.after(f.event,f.pre);assert.equal(f.saved[0].value.status,'unavailable');assert.match(f.saved[0].value.reason,/size/);});
 check('dependency changes during observation never yield a stale route',()=>{
  const f=setup('raced');install(f.dir);const orig=fs.readSync;let reads=0;
  fs.readSync=(...a)=>{const n=orig(...a);if(++reads===2){fs.chmodSync(path.join(f.dir,'node_modules/pnpm/bin/cli.cjs'),0o644);}return n;};
  try{const context=f.hints.after(f.event,f.pre);assert.ok(!context||!context.includes('path-found'));}finally{fs.readSync=orig;}
 });
 check('ancestor partial lint is explicit, bounded and not a test-suite claim',()=>{
  const parent=path.join(temp,'partial');fs.mkdirSync(parent);install(parent);install(parent,'10.2.1','eslint');
  const f=setup('partial/child',{originalDirectory:parent});
  json(path.join(f.dir,'package.json'),{packageManager:'pnpm@10.33.2',scripts:{test:'pnpm lint && vitest run --typecheck',lint:'eslint . && prettier -c src test'}});
  f.hints.after(f.event,f.pre);const h=f.saved[0].value;
  assert.equal(h.scope,'partial-lint');assert.equal(h.installed.name,'eslint');assert.equal(h.installed.version,'10.2.1');
  assert.match(h.reason,/skips lifecycle/);assert.match(h.reason,/Does not restore/);assert.ok(h.routes[0].endsWith("'eslint' '.'")||h.routes[0].endsWith("/eslint' '.'"));
 });
 check('denied ancestor not inspected',()=>{
  const parent=path.join(temp,'private-ancestor');fs.mkdirSync(parent);install(parent);
  const forbidden=path.join(parent,'node_modules');
  const f=setup('private-ancestor/child',{originalDirectory:parent,rules:[...rules,{permission:'read',pattern:forbidden+'*',action:'deny'}]});
  const orig=fs.lstatSync;fs.lstatSync=(p,...a)=>{assert.ok(!p.startsWith(forbidden));return orig(p,...a);};
  try{f.hints.after(f.event,f.pre);assert.equal(f.saved[0].value.status,'unavailable');}finally{fs.lstatSync=orig;}
 });
 check('PATH symlink existence suppresses hint without opening global package target',()=>{
  const f=setup('path-link');fs.symlinkSync('/forbidden-global-package/pnpm.cjs',path.join(f.empty,'pnpm'));
  const orig=fs.lstatSync;fs.lstatSync=(p,...a)=>{assert.ok(!p.startsWith('/forbidden-global-package'));return orig(p,...a);};
  try{assert.equal(f.hints.before(f.args,{cwd:f.dir},f.shell),null);}finally{fs.lstatSync=orig;}
 });
 check('working command and semantically wrong passing suite imply no correctness',()=>{
  const f=setup('semantic');
  // Required contract: 0 is a present value. Deliberately incorrect truthiness code.
  write(path.join(f.dir,'value.cjs'),'exports.present = value => !!value;');
  write(path.join(f.dir,'value.test.cjs'),"const {test}=require('node:test'),assert=require('node:assert/strict'),{present}=require('./value.cjs');test('ordinary nonzero case',()=>assert.equal(present(1),true));");
  const r=spawnSync(process.execPath,['--test','value.test.cjs'],{cwd:f.dir,encoding:'utf8'});assert.equal(r.status,0);
  const probe=spawnSync(process.execPath,['-e',"require('node:assert/strict').equal(require('./value.cjs').present(0),true)"],{cwd:f.dir,encoding:'utf8'});assert.equal(probe.status,1);
  assert.equal(f.hints.after({...f.event,exit:0,output:r.stdout+r.stderr},f.pre),null);assert.equal(f.saved.length,0);
 });
 console.log(JSON.stringify({passed:tests}));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
