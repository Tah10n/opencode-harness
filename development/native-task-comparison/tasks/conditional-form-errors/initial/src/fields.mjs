export function valueAt(values,path){let v=values;for(const p of path)v=v?.[p];return v;}export function missing(value){return !value;}
