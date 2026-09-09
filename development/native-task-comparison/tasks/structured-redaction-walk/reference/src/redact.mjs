import {copyRedacted} from './structure.mjs';
export function redact(value,{keys=['password','token'],mask='[REDACTED]'}={}){
 const selected=new Set(keys.map(key=>key.toLowerCase()));return copyRedacted(value,key=>selected.has(key.toLowerCase()),mask);
}
