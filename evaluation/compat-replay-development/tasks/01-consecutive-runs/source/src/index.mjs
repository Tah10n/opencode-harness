import {runs} from './runs.mjs';
export function encode(values){return runs(values);}
export function summary(values){return runs(values).map(r=>`${r.value}:${r.count}`).join(',');}
