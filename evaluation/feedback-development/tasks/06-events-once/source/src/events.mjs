export class Events {
 constructor(){this.listeners=new Map();}
 on(name,fn) {
  const entry={fn}; const list=this.listeners.get(name)??[];list.push(entry);this.listeners.set(name,list);
  return ()=>{const current=this.listeners.get(name)??[], at=current.indexOf(entry);if(at<0)return false;current.splice(at,1);return true;};
 }
 emit(name,...args) {
  const snapshot=[...(this.listeners.get(name)??[])];
  for(const entry of snapshot)if((this.listeners.get(name)??[]).includes(entry))entry.fn(...args);
 }
}
