import { displayToken } from "./token.mjs";

export function renderToken(value) {
  return `token:${displayToken(value)}`;
}
