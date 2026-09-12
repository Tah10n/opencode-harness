export function copyRedacted(value,shouldRedact,replacement='[REDACTED]'){
 const seen=new Map();function copy(input){if(input===null||typeof input!=='object')return input;if(seen.has(input))return seen.get(input);const array=Array.isArray(input),out=array?[]:Object.create(Object.getPrototypeOf(input));seen.set(input,out);for(const key of Object.keys(input)){const next=!array&&Reflect.apply(shouldRedact,undefined,[key])?replacement:copy(input[key]);Object.defineProperty(out,key,{value:next,enumerable:true,writable:true,configurable:true});}return out;}return copy(value);
}
