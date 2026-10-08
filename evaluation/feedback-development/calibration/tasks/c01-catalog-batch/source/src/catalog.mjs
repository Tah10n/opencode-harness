import {product} from './product.mjs';
export class Catalog {
 constructor(storage) { this.storage=storage; }
 list({tag}={}) { return this.storage.read().products.filter(p=>tag===undefined||p.tags.includes(tag)); }
 upsert(value) {
  const next=product(value),s=this.storage.read(),at=s.products.findIndex(p=>p.id===next.id);
  if(at<0)s.products.push(next);else s.products[at]=next;
  s.revision++;this.storage.write(s);return structuredClone(next);
 }
 revision() { return this.storage.read().revision; }
}
