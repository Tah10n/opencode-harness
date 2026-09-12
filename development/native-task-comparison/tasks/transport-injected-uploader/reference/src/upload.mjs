import {chunkBytes} from './chunks.mjs';
export async function upload(bytes,{chunkSize=65536,send}={}){
 if(typeof send!=='function')throw new TypeError('send');
 const chunks=chunkBytes(bytes,chunkSize);let sent=0;
 for(let index=0;index<chunks.length;index++){const chunk=chunks[index];await Reflect.apply(send,undefined,[chunk,{index,offset:sent,total:bytes.length,final:index===chunks.length-1}]);sent+=chunk.length;}
 return {bytes:sent,chunks:chunks.length};
}
