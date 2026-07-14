import { subtotal } from "../domain/total.mjs";
import { regionTaxRate } from "../infra/tax.mjs";

export function quote(items, region) {
  const value = subtotal(items);
  return value * (1 + regionTaxRate(region));
}
