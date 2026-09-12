export function queue(jobs) {
 const ready=jobs.map(x=>({...x})), leased=new Map();
 return {
  snapshot:()=>({ready:ready.map(x=>({...x})),leased:[...leased.values()].map(x=>({...x}))}),
  take(){const job=ready.shift();if(job)leased.set(job.id,job);return job;},
  retry(id){const job=leased.get(id);if(!job)return false;leased.delete(id);ready.push(job);return true;},
  ack(id){return leased.delete(id);}
 };
}
