import {readField} from './field.mjs';
export function column(rows,key){return rows.map(row=>readField(row,key));}
export function first(rows,key){return rows.length?readField(rows[0],key):null;}
