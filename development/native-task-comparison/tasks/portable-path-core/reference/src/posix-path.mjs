export function normalizePosix(text){
 if(typeof text!=='string'||text.includes('\0'))throw new TypeError('path');
 const absolute=text.startsWith('/'),parts=[];
 for(const segment of text.split('/')){
  if(segment===''||segment==='.')continue;
  if(segment==='..'){if(parts.length&&parts.at(-1)!=='..')parts.pop();else if(!absolute)parts.push('..');}
  else parts.push(segment);
 }
 let result=(absolute?'/':'')+parts.join('/');if(result==='')result='.';
 if(text.endsWith('/')&&result!=='/')result+='/';
 return result;
}
