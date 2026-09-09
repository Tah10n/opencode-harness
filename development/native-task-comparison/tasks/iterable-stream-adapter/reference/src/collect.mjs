export async function collect(source,{limit=Infinity,map=x=>x}={}){
 if(limit!==Infinity&&(!Number.isSafeInteger(limit)||limit<0))throw new RangeError('limit');
 const result=[];if(limit===0)return result;
 for await(const value of source){result.push(await map(value,result.length));if(result.length===limit)break;}
 return result;
}
