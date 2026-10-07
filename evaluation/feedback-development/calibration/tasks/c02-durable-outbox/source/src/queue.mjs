import {message} from './message.mjs';
export class Outbox {
 constructor(store,send) { this.store=store;this.send=send; }
 enqueue(id,payload) {
  const s=this.store.load();const old=s.records.find(r=>r.id===id);if(old)return structuredClone(old);
  const r=message(id,payload,s.nextSequence++);s.records.push(r);this.store.save(s);return structuredClone(r);
 }
 snapshot() { return this.store.load(); }
}
