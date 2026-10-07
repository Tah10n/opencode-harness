export class Cache {
 constructor(source) { this.source=source;this.values=new Map(); }
 async get(key) {
  if(typeof key!=='string'||!key)throw new TypeError('key');
  if(this.values.has(key))return structuredClone(this.values.get(key));
  const value=await this.source(key);this.values.set(key,structuredClone(value));return structuredClone(value);
 }
 has(key) { return this.values.has(key); }
 peek(key) { return structuredClone(this.values.get(key)); }
 clear() { this.values.clear(); }
}
