export function withQuery(input,updates) {
 const hashAt=input.indexOf('#'), hash=hashAt<0?'':input.slice(hashAt), bare=hashAt<0?input:input.slice(0,hashAt);
 const at=bare.indexOf('?'), base=at<0?bare:bare.slice(0,at), params=new URLSearchParams(at<0?'':bare.slice(at+1));
 for(const [key,value] of Object.entries(updates)) {
  if(value===undefined)continue;
  if(value===null)params.delete(key); else params.set(key,String(value));
 }
 const text=params.toString();return base+(text?'?'+text:'')+hash;
}
