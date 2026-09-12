export function delay(ms,{setTimeout:schedule=globalThis.setTimeout}={}){return new Promise(resolve=>schedule(()=>resolve(undefined),ms));}
