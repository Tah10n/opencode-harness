export function filterNames(names,filter){
 if(typeof filter==='string')return names.filter(name=>name.includes(filter));
 if(!(filter instanceof RegExp))throw new TypeError('filter');
 const copy=new RegExp(filter.source,filter.flags);
 return names.filter(name=>{copy.lastIndex=0;return copy.test(name);});
}
