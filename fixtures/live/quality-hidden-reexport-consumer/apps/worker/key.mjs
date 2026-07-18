import { publicToken } from "../../packages/api/index.mjs";

export function workerKey(value) {
  return `job:${publicToken(value)}`;
}
