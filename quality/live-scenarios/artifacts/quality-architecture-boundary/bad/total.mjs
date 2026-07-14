import { regionTaxRate } from "../infra/tax.mjs";

export function subtotal(items, region = "HU") {
  const value = items.reduce((sum, item) => sum + item.price, 0);
  return value * (1 + regionTaxRate(region));
}
