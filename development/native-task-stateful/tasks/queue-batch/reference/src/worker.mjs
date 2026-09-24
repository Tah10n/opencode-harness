export function work(q, send, limit=1) {
 if(!Number.isSafeInteger(limit)||limit<0)throw new TypeError('limit');
 const count=Math.min(limit,q.snapshot().ready.length), out={sent:[],retried:[]};
 for(let i=0;i<count;i++){const job=q.take();const ok=send(job);if(ok){q.ack(job.id);out.sent.push(job.id);}else{q.retry(job.id);out.retried.push(job.id);}}
 return out;
}
