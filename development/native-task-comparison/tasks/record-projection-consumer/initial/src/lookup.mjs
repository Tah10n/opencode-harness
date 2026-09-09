export function lookup(record,path){let v=record;for(const p of path)v=v?.[p];return v?{found:true,value:v}:{found:false};}export function copyValue(value){return value;}
