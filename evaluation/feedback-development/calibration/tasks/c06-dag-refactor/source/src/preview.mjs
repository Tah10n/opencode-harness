import {normalize} from './normalize.mjs';
export function preview(jobs,options) {

 const {items,capacity}=normalize(jobs,options),done=new Set(),waves=[];
 while(done.size<items.length) {
  const ready=items.filter(j=>!done.has(j.id)&&j.needs.every(n=>done.has(n))).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  let available=capacity;const wave=[];
  for(const job of ready)if(job.slots<=available){wave.push(job.id);available-=job.slots;}
  if(!wave.length)throw new Error('dependency cycle');waves.push(wave);wave.forEach(id=>done.add(id));
 }
 return {waves,order:waves.flat(),estimated: waves.reduce((sum,wave)=>sum+Math.max(...wave.map(id=>items.find(j=>j.id===id).seconds)),0)};
}
