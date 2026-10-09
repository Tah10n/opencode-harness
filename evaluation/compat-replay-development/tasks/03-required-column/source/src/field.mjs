export function readField(row,key){if(!Object.hasOwn(row,key))throw new RangeError('missing field: '+key);return row[key];}
