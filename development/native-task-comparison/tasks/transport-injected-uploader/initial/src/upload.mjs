function chunkBytes(bytes,size){
 if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(size)||size<1||size>1048576)throw new TypeError('chunks');
 const chunks=[];for(let start=0;start<bytes.length;start+=size)chunks.push(Uint8Array.from(bytes.subarray(start,start+size)));return chunks;
}
export async function upload(bytes,{chunkSize=65536,send}={}){
 if(typeof send!=='function')throw new TypeError('send');
 const chunks=chunkBytes(bytes,chunkSize);let sent=0;
 for(let index=0;index<chunks.length;index++){const chunk=chunks[index];await Reflect.apply(send,undefined,[chunk,{index,offset:sent,total:bytes.length,final:index===chunks.length-1}]);sent+=chunk.length;}
 return {bytes:sent,chunks:chunks.length};
}
