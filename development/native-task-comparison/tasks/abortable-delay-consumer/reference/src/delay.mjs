export function delay(ms,{signal,setTimeout:schedule=globalThis.setTimeout,clearTimeout:cancel=globalThis.clearTimeout}={}){
 return new Promise((resolve,reject)=>{
  if(!Number.isInteger(ms)||ms<0||ms>1000000){reject(new RangeError('delay'));return;}
  if(signal?.aborted){reject(signal.reason);return;}
  let settled=false,timer;
  const remove=()=>signal?.removeEventListener('abort',abort);
  const abort=()=>{if(settled)return;settled=true;cancel(timer);remove();reject(signal.reason);};
  const done=()=>{if(settled)return;settled=true;remove();resolve(undefined);};
  timer=schedule(done,ms);signal?.addEventListener('abort',abort);
 });
}
