export function createReader(readFile){
 return function read(path,options,callback){
  if(typeof options==='function'){callback=options;options={};}
  if(typeof callback!=='function')throw new TypeError('callback');
  const signal=options?.signal;let settled=false,listening=false;
  const cleanup=()=>{if(listening){listening=false;signal.removeEventListener('abort',abort);}};
  const finish=(error,data)=>{if(settled)return;settled=true;cleanup();Reflect.apply(callback,undefined,[error,data]);};
  const abort=()=>finish(signal.reason,undefined);
  if(signal?.aborted){abort();return undefined;}
  if(signal){signal.addEventListener('abort',abort);listening=true;}
  try{readFile(path,(error,data)=>finish(error,data));}catch(error){settled=true;cleanup();throw error;}
  return undefined;
 };
}
