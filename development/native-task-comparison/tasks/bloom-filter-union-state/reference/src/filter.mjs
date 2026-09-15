function dimensions(bits,hashes){return Number.isInteger(bits)&&bits>=8&&bits<=8192&&bits%8===0&&Number.isInteger(hashes)&&hashes>=1&&hashes<=8;}
function decode(snapshot){
 if(snapshot.version!==1||!dimensions(snapshot.bits,snapshot.hashes)||typeof snapshot.data!=='string')throw new TypeError('snapshot');const bytes=Buffer.from(snapshot.data,'base64');if(bytes.length!==snapshot.bits/8||bytes.toString('base64')!==snapshot.data)throw new TypeError('snapshot');return bytes;
}
function locations(value,bits,hashes){
 if(typeof value!=='string')throw new TypeError('value');let h1=2166136261,h2=5381;for(const byte of new TextEncoder().encode(value)){h1=Math.imul(h1^byte,16777619)>>>0;h2=(Math.imul(h2,33)+byte)>>>0;}h2=(h2|1)>>>0;return Array.from({length:hashes},(_,i)=>(h1+i*h2)%bits);
}
function make(bits,hashes,bytes){return{
 add(value){for(const bit of locations(value,bits,hashes))bytes[bit>>3]|=1<<(bit%8);},
 has(value){return locations(value,bits,hashes).every(bit=>(bytes[bit>>3]&(1<<(bit%8)))!==0);},
 snapshot(){return{version:1,bits,hashes,data:bytes.toString('base64')};},
 union(snapshot){const incoming=decode(snapshot);if(snapshot.bits!==bits||snapshot.hashes!==hashes)throw new TypeError('incompatible filter');for(let i=0;i<bytes.length;i++)bytes[i]|=incoming[i];}
};}
export function createFilter(bits=256,hashes=3){if(!dimensions(bits,hashes))throw new TypeError('filter');return make(bits,hashes,Buffer.alloc(bits/8));}
export function restoreFilter(snapshot){return make(snapshot.bits,snapshot.hashes,decode(snapshot));}
