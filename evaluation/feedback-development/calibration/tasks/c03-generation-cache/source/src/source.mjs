export function memorySource(records) {
 const values=structuredClone(records);
 return async key=>{if(!Object.hasOwn(values,key))throw new Error('missing asset');return structuredClone(values[key]);};
}
