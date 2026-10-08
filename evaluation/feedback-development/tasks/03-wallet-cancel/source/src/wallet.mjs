import fs from 'node:fs';
export class Wallet {
 constructor(file,initialCents=0) {
  this.file=file;
  if(!fs.existsSync(file)) this.write({available:initialCents,holds:{},settled:[]});
 }
 read() { return JSON.parse(fs.readFileSync(this.file,'utf8')); }
 write(state) { fs.writeFileSync(this.file,JSON.stringify(state)); }
 deposit(cents) {
  if(!Number.isInteger(cents)||cents<=0) throw new RangeError('amount');
  const state=this.read(); state.available+=cents; this.write(state);
 }
 reserve(id,cents) {
  const state=this.read();
  if(typeof id!=='string'||!id||!Number.isInteger(cents)||cents<=0) throw new RangeError('reservation');
  if(Object.hasOwn(state.holds,id)||state.settled.includes(id)||state.available<cents) return false;
  state.available-=cents; state.holds[id]=cents; this.write(state); return true;
 }
 commit(id) {
  const state=this.read(); if(!Object.hasOwn(state.holds,id)) return false;
  delete state.holds[id]; state.settled.push(id); this.write(state); return true;
 }
 cancel(id) {
  const state=this.read(); if(!Object.hasOwn(state.holds,id)) return false;
  delete state.holds[id]; this.write(state); return true;
 }
}
