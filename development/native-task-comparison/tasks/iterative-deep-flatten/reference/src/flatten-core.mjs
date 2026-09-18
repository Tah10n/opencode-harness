export function flattenValues(input,depth=Infinity){
 if(!Array.isArray(input)||!(depth===Infinity||Number.isSafeInteger(depth)&&depth>=0))throw new TypeError('flatten');
 const result=[],stack=[{array:input,index:0,depth}];
 while(stack.length){const top=stack.at(-1);if(top.index===top.array.length){stack.pop();continue;}const index=top.index++;if(!Object.hasOwn(top.array,index))continue;const value=top.array[index];if(Array.isArray(value)&&top.depth>0)stack.push({array:value,index:0,depth:top.depth===Infinity?Infinity:top.depth-1});else result.push(value);}
 return result;
}
