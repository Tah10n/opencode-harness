export async function withResources(resources,body){
 const stack=resources.filter(r=>r!==null&&r!==undefined).map(resource=>({resource,method:resource[Symbol.asyncDispose]??resource[Symbol.dispose]??resource.dispose}));
 let value,bodyFailed=false,bodyError,cleanupFailed=false,cleanupError;
 try{value=await body();}catch(error){bodyFailed=true;bodyError=error;}
 for(let i=stack.length-1;i>=0;i--){const {resource,method}=stack[i];try{await Reflect.apply(method,resource,[]);}catch(error){if(!cleanupFailed){cleanupFailed=true;cleanupError=error;}}}
 if(bodyFailed)throw bodyError;if(cleanupFailed)throw cleanupError;return value;
}
