export function copyValues(source){
 const output={};
 for(const key of Reflect.ownKeys(source)){
  if(!Object.prototype.propertyIsEnumerable.call(source,key))continue;
  Object.defineProperty(output,key,{value:source[key],enumerable:true,writable:true,configurable:true});
 }
 return output;
}
