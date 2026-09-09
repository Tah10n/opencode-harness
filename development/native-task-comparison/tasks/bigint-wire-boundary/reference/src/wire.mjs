const PREFIX='bigint-json:1:';
export function stringify(value){
 const paths=[];
 function copy(node,path){
  if(typeof node==='bigint'){paths.push(path);return String(node);}
  if(Array.isArray(node))return node.map((item,i)=>copy(item,[...path,i]));
  if(node!==null&&typeof node==='object')return Object.fromEntries(Object.keys(node).map(key=>[key,copy(node[key],[...path,key])]));
  return node;
 }
 const data=copy(value,[]);return paths.length?PREFIX+JSON.stringify({data,paths}):JSON.stringify(data);
}
export function parse(text){
 if(!text.startsWith('bigint-json:'))return JSON.parse(text);
 const bad=()=>{throw new TypeError('BigInt wire');};
 if(!text.startsWith(PREFIX))bad();
 let envelope;try{envelope=JSON.parse(text.slice(PREFIX.length));}catch{bad();}
 if(envelope===null||Array.isArray(envelope)||typeof envelope!=='object'||Object.keys(envelope).length!==2||!Object.hasOwn(envelope,'data')||!Array.isArray(envelope.paths)||envelope.paths.length===0)bad();
 let result=envelope.data;const seen=new Set(),updates=[];
 for(const path of envelope.paths){
  if(!Array.isArray(path))bad();const serialized=JSON.stringify(path);if(seen.has(serialized))bad();seen.add(serialized);
  let parent=null,key=null,node=result;
  for(const part of path){
   if(node===null||typeof node!=='object')bad();
   if(Array.isArray(node)){if(!Number.isInteger(part)||part<0||part>=node.length)bad();}
   else if(typeof part!=='string')bad();
   if(!Object.hasOwn(node,part))bad();parent=node;key=part;node=node[part];
  }
  if(typeof node!=='string'||!(/^-?(0|[1-9][0-9]*)$/).test(node)||node==='-0'||node.replace('-','').length>100)bad();
  updates.push({parent,key,value:BigInt(node)});
 }
 for(const update of updates){if(update.parent===null)result=update.value;else Object.defineProperty(update.parent,update.key,{value:update.value,writable:true,enumerable:true,configurable:true});}
 return result;
}
