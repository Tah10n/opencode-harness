export function parseColor(text){
 if(typeof text!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text))throw new TypeError('color');
 let hex=text.slice(1);if(hex.length<=4)hex=[...hex].map(c=>c+c).join('');if(hex.length===6)hex+='ff';const bytes=[0,2,4,6].map(i=>parseInt(hex.slice(i,i+2),16));return{r:bytes[0],g:bytes[1],b:bytes[2],a:bytes[3]};
}
export function shiftColor(color,amount){
 if(!Number.isFinite(amount)||amount< -1||amount>1)throw new RangeError('amount');
 const shift=value=>Math.round(amount>=0?value+(255-value)*amount:value*(1+amount));return{r:shift(color.r),g:shift(color.g),b:shift(color.b),a:color.a};
}
export function formatColor(color){const values=[color.r,color.g,color.b];if(color.a!==255)values.push(color.a);return'#'+values.map(n=>n.toString(16).padStart(2,'0')).join('');}
