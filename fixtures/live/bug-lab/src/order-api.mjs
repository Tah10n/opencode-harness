import { normalizeOrderId } from "./lib/normalize-order-id.mjs";

export function formatOrder(id) {
  return `ORDER-${normalizeOrderId(id)}`;
}
