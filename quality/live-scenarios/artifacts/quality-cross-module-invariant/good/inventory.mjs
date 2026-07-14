import { normalizeSku } from "./sku.mjs";

export function inventoryKey(tenant, sku) {
  return `${tenant}:${normalizeSku(sku).toUpperCase()}`;
}
