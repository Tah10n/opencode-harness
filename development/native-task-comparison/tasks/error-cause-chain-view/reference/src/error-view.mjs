export function formatError(error){
 if(!(error instanceof Error))throw new TypeError('error root');
 const seen=new Set(),lines=[];let current=error;
 while(current!==undefined){
  if(current instanceof Error){
   if(seen.has(current)){lines.push('[Circular cause]');break;}
   seen.add(current);lines.push(current.name+': '+current.message);
   current=Object.hasOwn(current,'cause')?current.cause:undefined;
  }else{lines.push(String(current));break;}
 }
 return lines.map((line,i)=>i===0?line:'Caused by: '+line).join('\n');
}
