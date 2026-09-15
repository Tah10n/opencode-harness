export function batches(input,size){
 if(!Number.isInteger(size)||size<1||size>10000)throw new RangeError('size');
 if(input===null||(typeof input!=='object'&&typeof input!=='string'))throw new TypeError('input');
 const source=Object(input),length=source.length;
 if(!Number.isInteger(length)||length<0||length>10000)throw new RangeError('length');
 const output=[];for(let start=0;start<length;start+=size){
  const chunk=new Array(Math.min(size,length-start));
  for(let j=0;j<chunk.length;j++){const index=start+j;if(index in source)chunk[j]=source[index];}
  output.push(chunk);
 }
 return output;
}
