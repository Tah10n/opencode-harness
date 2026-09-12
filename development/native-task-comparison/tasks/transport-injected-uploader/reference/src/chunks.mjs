export function chunkBytes(bytes,size){
 if(!(bytes instanceof Uint8Array)||!Number.isSafeInteger(size)||size<1||size>1048576)throw new TypeError('chunks');
 const chunks=[];for(let start=0;start<bytes.length;start+=size)chunks.push(Uint8Array.from(bytes.subarray(start,start+size)));return chunks;
}
