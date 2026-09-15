export function checksum(input){
 let bytes;
 if(input instanceof ArrayBuffer)bytes=new Uint8Array(input);
 else if(ArrayBuffer.isView(input)&&input.buffer instanceof ArrayBuffer)bytes=new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
 else throw new TypeError('byte input');
 let sum=0;for(const byte of bytes)sum=(sum+byte)>>>0;return sum;
}
