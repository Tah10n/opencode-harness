export function normalize(jobs,{capacity=2}={}) {
 if(!Array.isArray(jobs))throw new TypeError('jobs');
 if(!Number.isSafeInteger(capacity)||capacity<1||capacity>8)throw new RangeError('capacity');
 const items=jobs.map(j=>{
  if(typeof j?.id!=='string'||!j.id)throw new TypeError('id');
  const needs=j.needs??[],slots=j.slots??1,seconds=j.seconds??1;
  if(!Array.isArray(needs)||needs.some(n=>typeof n!=='string'||!n))throw new TypeError('needs');
  if(!Number.isSafeInteger(slots)||slots<1||slots>capacity||typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<=0)throw new RangeError('resources');
  return {id:j.id,needs:[...new Set(needs)],slots,seconds};
 });
 const ids=new Set(items.map(j=>j.id));if(ids.size!==items.length)throw new Error('duplicate job');
 if(items.some(j=>j.needs.some(n=>!ids.has(n))))throw new Error('missing dependency');return {items,capacity};
}
