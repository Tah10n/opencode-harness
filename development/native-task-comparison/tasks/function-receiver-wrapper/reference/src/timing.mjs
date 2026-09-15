export function timed(fn,{now,record}){
 return function(...args){
  const start=now();let outcome='throw';
  try{const result=Reflect.apply(fn,this,args);outcome='return';return result;}
  finally{record({duration:now()-start,outcome});}
 };
}
