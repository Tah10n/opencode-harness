export function product(value) {
 if (!value || typeof value.id!=='string' || !value.id.trim()) throw new TypeError('id');
 if (typeof value.name!=='string' || !value.name.trim()) throw new TypeError('name');
 if (!Number.isSafeInteger(value.priceCents) || value.priceCents<0) throw new RangeError('priceCents');
 const tags=value.tags??[];
 if (!Array.isArray(tags)||tags.some(t=>typeof t!=='string'||!t)) throw new TypeError('tags');
 return {id:value.id,name:value.name,priceCents:value.priceCents,tags:[...new Set(tags)]};
}
