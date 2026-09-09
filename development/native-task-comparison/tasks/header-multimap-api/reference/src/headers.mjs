const normalize=name=>{if(typeof name!=='string'||!(/^[!#$%&'*+\-.^_\x60|~0-9A-Za-z]+$/).test(name))throw new TypeError('header name');return name.toLowerCase();};
const valueOf=value=>{if(typeof value!=='string'||/[\r\n\0]/.test(value))throw new TypeError('header value');return value.replace(/^[ \t]+|[ \t]+$/g,'');};
export function headers(input={}){
 const rows=[];const add=(name,value)=>rows.push([normalize(name),valueOf(value)]);
 if(typeof input[Symbol.iterator]==='function'){for(const pair of input){if(!Array.isArray(pair)||pair.length!==2)throw new TypeError('pair');add(pair[0],pair[1]);}}
 else for(const [name,value]of Object.entries(input)){if(Array.isArray(value)){normalize(name);for(const item of value)add(name,item);}else add(name,value);}
 return {get(name){const n=normalize(name);return rows.find(row=>row[0]===n)?.[1];},getAll(name){const n=normalize(name);return rows.filter(row=>row[0]===n).map(row=>row[1]);},
 *entries(){for(const row of rows)yield [...row];},[Symbol.iterator](){return this.entries();}};
}
