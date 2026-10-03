import {invoice} from './pricing.mjs';
export function exportInvoice(lines) {
  const bill=invoice(lines);
  return JSON.stringify({totalCents:bill.totalCents,lines:bill.items.map(({name,quantity,unitCents,totalCents})=>({name,quantity,unitCents,totalCents}))});
}
