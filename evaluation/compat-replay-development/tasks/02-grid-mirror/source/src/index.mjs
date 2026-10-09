import {rotate} from './row.mjs';
export function mirror(row){return rotate(row);}
export function mirrorGrid(rows){return rows.map(rotate);}
