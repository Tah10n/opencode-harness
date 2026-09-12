export function tokenize(source){
 if(typeof source!=='string')throw new TypeError('source');
 const tokens=[];let i=0;
 while(i<source.length){
  if(/[ \t\r\n]/.test(source[i])){i++;continue;}
  const start=i;
  if(/[0-9]/.test(source[i])){while(i<source.length&&/[0-9]/.test(source[i]))i++;tokens.push({kind:'number',value:Number(source.slice(start,i)),start,end:i});}
  else if('+-*()'.includes(source[i])){tokens.push({kind:source[i],value:source[i],start,end:++i});}
  else throw new SyntaxError('Unexpected character at '+i);
 }
 tokens.push({kind:'eof',value:null,start:source.length,end:source.length});return tokens;
}
