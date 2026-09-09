function valid(value){return typeof value==='string'&&value.length>0&&!value.includes('\\')&&!value.includes('\0')&&value.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');}
export function selectPaths(paths,exclude=[]){
 if(!paths.every(valid)||!exclude.every(valid))throw new TypeError('path');
 return [...new Set(paths)].filter(name=>!exclude.some(prefix=>name===prefix||name.startsWith(prefix+'/'))).sort();
}
