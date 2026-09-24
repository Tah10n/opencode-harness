import {randomUUID} from 'node:crypto';
export function createRecord(input,existingIds=new Set(),{nextId=randomUUID}={}){
 if(typeof input.name!=='string'||input.name.trim().length<1||input.name.trim().length>80)throw new TypeError('name');
 const name=input.name.trim(),id=nextId();
 if(typeof id!=='string'||!(/^[A-Za-z0-9_-]{1,64}$/).test(id))throw new TypeError('id');
 if(existingIds.has(id))throw Object.assign(new Error('collision'),{code:'ID_COLLISION'});
 existingIds.add(id);return {id,name};
}
