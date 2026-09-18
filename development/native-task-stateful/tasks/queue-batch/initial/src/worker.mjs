export function work(q, send) {
 const job=q.take();if(!job)return {sent:[],retried:[]};
 const ok=send(job);if(ok)q.ack(job.id);else q.retry(job.id);
 return {sent:ok?[job.id]:[],retried:ok?[]:[job.id]};
}
