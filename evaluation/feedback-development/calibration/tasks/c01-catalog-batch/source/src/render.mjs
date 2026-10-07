export function render(catalog,{tag,format='json'}={}) {
 const products=catalog.list({tag});
 if(format==='json')return JSON.stringify(products);
 if(format==='text')return products.map(p=>p.id+'\t'+p.name+'\t'+p.priceCents).join('\n');
 throw new RangeError('format');
}
