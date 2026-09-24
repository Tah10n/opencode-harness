export function timed(fn,{now,record}){
  return function(...args){
    const start=now();
    try{
      const result=fn.apply(this,args);
      const end=now();
      record({duration:end-start,outcome:'return'});
      return result;
    }catch(error){
      const end=now();
      record({duration:end-start,outcome:'throw'});
      throw error;
    }
  };
}
