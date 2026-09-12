import {plan} from './plan.mjs';export function checkout(stock,lines){const result=plan(stock,lines);for(const x of result.accepted)stock[x.sku]-=x.qty;return result;}
