export async function runHooks(hooks,input){let value=input;const trace=[];for(const h of hooks){value=(await h.run(value)).value;trace.push(h.id);}return {value,trace,stopped:false};}
