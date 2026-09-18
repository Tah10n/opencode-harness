import {match} from './match.mjs';export function dispatch(routes,path){for(const r of routes){const m=match(r.pattern,path);if(m)return r.handle(m.params);}return null;}
