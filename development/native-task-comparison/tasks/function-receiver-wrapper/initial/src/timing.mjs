export function timed(fn,{now,record}){return (...args)=>{const start=now();const result=fn(...args);record({duration:now()-start,outcome:'return'});return result;};}
