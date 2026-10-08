// Container-only restricted ES modules. This is deliberately not a JS serializer.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {types} from 'node:util';

function jsonValue(value, realm, depth=0, budget={nodes:0}) {
  if(++budget.nodes>2048||depth>12)throw Error('JSON bounds');
  if(value===null||typeof value==='boolean'||typeof value==='string'&&value.length<=4096)return value;
  if(typeof value==='number'&&Number.isFinite(value)&&!Object.is(value,-0))return value;
  if(typeof value!=='object'||types.isProxy(value))throw Error('Unsupported JSON value');
  const array=Array.isArray(value), proto=Object.getPrototypeOf(value);
  if(proto!==(array?realm.array:realm.object))throw Error('Unsupported prototype');
  const keys=Reflect.ownKeys(value);
  if(keys.length>256||keys.some(k=>typeof k!=='string'))throw Error('Unsupported keys');
  if(array&&(value.length>128||keys.length!==value.length+1||keys.some(k=>k!=='length'&&!/^(0|[1-9]\d*)$/.test(k))))throw Error('Sparse or extended array');
  const out=array?[]:Object.create(null);
  for(const key of keys.filter(k=>!array||k!=='length').sort()) {
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!('value' in d)||!d.enumerable)throw Error('Accessor or hidden property');
    out[key]=jsonValue(d.value,realm,depth+1,budget);
  }
  return out;
}
async function call(root,scenario) {
  const context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false},microtaskMode:'afterEvaluate'});
  vm.runInContext("let impure=false;const forbidden=()=>{impure=true;throw Error('Nondeterministic API');};Date=forbidden;Math.random=forbidden;globalThis.Intl=undefined;globalThis.WeakRef=undefined;globalThis.FinalizationRegistry=undefined;globalThis.SharedArrayBuffer=undefined;",context,{timeout:100});
  const nondeterministic=()=>vm.runInContext('impure',context,{timeout:100});
  const realm=vm.runInContext('({object:Object.prototype,array:Array.prototype,errors:[Error.prototype,TypeError.prototype,RangeError.prototype]})',context);
  const modules=new Map();let bytes=0;
  async function load(relative) {
    if(!/^[a-zA-Z0-9_./-]+\.mjs$/.test(relative)||relative.split('/').includes('..')||path.isAbsolute(relative))throw Error('Unsupported module path');
    if(modules.has(relative))return modules.get(relative);
    let cursor=root;for(const part of relative.split('/')){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink())throw Error('Symlink module');}
    const file=path.join(root,relative),stat=fs.statSync(file);
    if(!stat.isFile()||stat.size>65536||(bytes+=stat.size)>262144||modules.size>=32)throw Error('Module bounds');
    const mod=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:relative});modules.set(relative,mod);
    await mod.link((specifier,from)=>{
      if(!specifier.startsWith('./'))throw Error('Only relative ES module imports supported');
      return load(path.posix.join(path.posix.dirname(from.identifier),specifier));
    });return mod;
  }
  let mod;
  try{mod=await load(scenario.module);await mod.evaluate({timeout:200});}
  catch(error){return {status:nondeterministic()?'unproven':'unsupported',reason:nondeterministic()?'nondeterminism':'module execution: '+error.message};}
  if(typeof mod.namespace[scenario.export]!=='function')return {status:'unsupported',reason:'Missing synchronous entrypoint'};
  context.entry=mod.namespace[scenario.export];
  const repeats=[];
  for(let i=0;i<2;i++) {
    // JSON.parse in the module realm avoids exposing host object constructors.
    context.inputJSON=JSON.stringify(scenario.args);
    vm.runInContext('globalThis.args=JSON.parse(inputJSON)',context,{timeout:100});
    let thrown=false,value;
    try{value=vm.runInContext('entry(...args)',context,{timeout:200});}
    catch(error){if(error.code==='ERR_SCRIPT_EXECUTION_TIMEOUT')return {status:'unproven',reason:'timeout'};thrown=true;value=error;}
    if(nondeterministic())return {status:'unproven',reason:'nondeterminism'};
    try {
      const args=jsonValue(context.args,realm);
      if(thrown) {
        if(types.isProxy(value)||!realm.errors.includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).some(k=>!['stack','message'].includes(k)||k==='message'&&!('value' in Object.getOwnPropertyDescriptor(value,k))))throw Error('Unsupported exception');
        repeats.push({kind:'throw',name:['Error','TypeError','RangeError'][realm.errors.indexOf(Object.getPrototypeOf(value))],message:jsonValue(Object.getOwnPropertyDescriptor(value,'message')?.value??'',realm),args});
      }else repeats.push({kind:'return',value:jsonValue(value,realm),args});
    }catch(error){return {status:'unsupported',reason:error.message};}
  }
  if(JSON.stringify(repeats[0])!==JSON.stringify(repeats[1]))return {status:'unproven',reason:'nondeterminism'};
  return {status:'observed',behavior:repeats[0]};
}
try {
  if(!fs.existsSync('/.dockerenv'))throw Error('Container required; host project execution refused');
  const [root,corpusFile]=process.argv.slice(2),corpus=JSON.parse(fs.readFileSync(corpusFile));
  const rows=[];
  for(const scenario of corpus.cases)rows.push({id:scenario.id,...await call(root,scenario)});
  console.log(JSON.stringify({revision:1,complete:true,rows}));
}catch(error){console.log(JSON.stringify({revision:1,complete:false,error:error.message}));process.exitCode=1;}
