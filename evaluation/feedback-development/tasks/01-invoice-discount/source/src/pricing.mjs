import {validateLine} from './validate.mjs';
export function invoice(lines) {
  const items=lines.map(validateLine).map(line=>({...line, totalCents:line.quantity*line.unitCents}));
  return {items,totalCents:items.reduce((sum,line)=>sum+line.totalCents,0)};
}
