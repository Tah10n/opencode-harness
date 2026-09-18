import {loadQueue,saveQueue} from './queue.mjs';
export async function flush(file,send){const queue=loadQueue(file);for(const item of queue)await send(item.payload,item.id);saveQueue(file,[]);return {delivered:queue.length,pending:0};}
