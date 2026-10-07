import {parseText} from './parse.mjs';
export async function importRecords(input) {
 const records=parseText(input);return {records,total:records.reduce((n,r)=>n+r.count,0)};
}
