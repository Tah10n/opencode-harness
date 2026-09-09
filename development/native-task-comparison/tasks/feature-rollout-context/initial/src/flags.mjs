export function enabledFlags(flags,user){return Object.keys(flags).filter(k=>flags[k].enabled&&flags[k].basisPoints===10000).sort();}
