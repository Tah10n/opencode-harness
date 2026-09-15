import {occurrences} from './weekly.mjs';export function calendar(r){return occurrences(r.start,r.end,r.weekdays).map(date=>({original:date,date}));}
