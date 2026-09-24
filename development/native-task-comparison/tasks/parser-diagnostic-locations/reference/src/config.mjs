import {scanAssignments} from './assignment-scanner.mjs';
export function parseConfig(text){
 const entries=scanAssignments(text),result={};
 for(const entry of entries){if(Object.hasOwn(result,entry.key))throw new SyntaxError('Duplicate key at '+entry.line+':'+entry.keyColumn);Object.defineProperty(result,entry.key,{value:entry.value,enumerable:true,writable:true,configurable:true});}
 return result;
}
