export function viewMap(source){
 if(!(source instanceof Map))throw new TypeError('Map source');
 const deny=()=>{throw new TypeError('read-only');};
 const view={get size(){return source.size;},get:key=>source.get(key),has:key=>source.has(key),
 keys:()=>source.keys(),values:()=>source.values(),entries:()=>source.entries(),
 [Symbol.iterator]:()=>source.entries(),
 forEach(callback,thisArg){source.forEach((value,key)=>Reflect.apply(callback,thisArg,[value,key,view]));},
 set:deny,delete:deny,clear:deny};
 return Object.freeze(view);
}
