export function record(value) {
 if(!value||typeof value.id!=='string'||!value.id)throw new TypeError('id');
 if(!Number.isSafeInteger(value.count)||value.count<0)throw new RangeError('count');
 return {id:value.id,count:value.count};
}
