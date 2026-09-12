export function buildReport(expenses, options={}) {
 let rows=expenses;
 if(Object.hasOwn(options,'currency')) { if(typeof options.currency!=='string'||!['EUR','USD'].includes(options.currency.toUpperCase())) throw new RangeError('Currency must be EUR or USD');rows=rows.filter(x=>x.currency===options.currency.toUpperCase()); }
 return {rows:rows.map(x=>({...x})),count:rows.length,totalCents:rows.reduce((n,x)=>n+x.amountCents,0)};
}
