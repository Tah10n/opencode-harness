import { subtotal } from "../domain/total.mjs";

export function quote(items, region) {
  return subtotal(items, region);
}
