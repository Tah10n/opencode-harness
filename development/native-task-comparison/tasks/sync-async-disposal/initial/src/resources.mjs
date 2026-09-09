export async function withResources(resources,body){try{return await body();}finally{for(let i=resources.length-1;i>=0;i--)await resources[i].dispose();}}
