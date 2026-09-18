export function plan(stock,lines){
 if(!Array.isArray(lines)||lines.some(x=>!x||typeof x.sku!=='string'||!x.sku||!Number.isSafeInteger(x.qty)||x.qty<=0))throw new TypeError('Invalid lines');
 const left={...stock},accepted=[],rejected=[];
 lines.forEach((x,index)=>{if(!Object.hasOwn(left,x.sku)||left[x.sku]<x.qty)rejected.push({index,sku:x.sku,qty:x.qty,reason:'unavailable'});else{left[x.sku]-=x.qty;accepted.push({index,sku:x.sku,qty:x.qty});}});
 return {accepted,rejected};
}
