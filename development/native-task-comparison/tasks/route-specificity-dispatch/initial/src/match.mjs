export function match(pattern,path){return pattern===path?{params:{},rank:pattern==='/'?[]:pattern.slice(1).split('/').map(()=>2)}:null;}
