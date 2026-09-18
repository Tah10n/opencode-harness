import {taxCents} from './tax.mjs';
export function invoiceTotal(lines,basisPoints){let subtotal=0,tax=0;for(const amount of lines){subtotal+=amount;tax+=taxCents(amount,basisPoints);}return {subtotal,tax,total:subtotal+tax};}
