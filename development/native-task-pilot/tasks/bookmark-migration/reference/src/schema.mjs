export function normalize(value){
 if(!value||![1,2].includes(value.version)||!Array.isArray(value.bookmarks))throw new TypeError('Invalid store');
 const ids=new Set();let max=0;
 const bookmarks=value.bookmarks.map((x,i)=>{if(!x||typeof x.url!=='string'||!x.url||typeof x.title!=='string'||(x.tags!==undefined&&(!Array.isArray(x.tags)||x.tags.some(t=>typeof t!=='string'))))throw new TypeError('Invalid bookmark');const id=value.version===1?'b'+(i+1):x.id;if(typeof id!=='string'||!id||ids.has(id))throw new TypeError('Invalid ID');ids.add(id);if(/^b[0-9]+$/.test(id))max=Math.max(max,Number(id.slice(1)));return {...x,id,tags:[...(x.tags??[])]};});
 const nextId=value.version===1?bookmarks.length+1:value.nextId;if(!Number.isSafeInteger(nextId)||nextId<1||nextId<=max)throw new TypeError('Invalid nextId');return {...value,version:2,bookmarks,nextId};
}
