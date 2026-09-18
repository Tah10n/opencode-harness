import {evaluate} from './rollout.mjs';export function enabledFlags(flags,user){return Object.keys(flags).sort().filter(name=>evaluate(flags[name],user));}
