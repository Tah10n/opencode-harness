import {normalize} from './normalize.mjs';
export async function runJobs(jobs,runner,options) {
 const plan=(()=>{

 const {items,capacity}=normalize(jobs,options),done=new Set(),waves=[];
 while(done.size<items.length) {
  const ready=items.filter(j=>!done.has(j.id)&&j.needs.every(n=>done.has(n))).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  let available=capacity;const wave=[];
  for(const job of ready)if(job.slots<=available){wave.push(job.id);available-=job.slots;}
  if(!wave.length)throw new Error('dependency cycle');waves.push(wave);wave.forEach(id=>done.add(id));
 }
 return {waves,order:waves.flat(),estimated: waves.reduce((sum,wave)=>sum+Math.max(...wave.map(id=>items.find(j=>j.id===id).seconds)),0)};
 })();

 const results=[];
 for(const wave of plan.waves) {
  const settled=await Promise.allSettled(wave.map(id=>Promise.resolve().then(()=>runner(id))));
  const failure=settled.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  wave.forEach((id,i)=>results.push({id,value:settled[i].value}));
 }
 return {plan,results};
}
