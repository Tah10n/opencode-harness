#!/usr/bin/env node
import { benchmarkV3OperatorImageIdentity } from "../lib/benchmark/v3-operator-image.mjs";

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 2 * 1024 * 1024) throw new Error("docker image inspection exceeds the size limit");
}
const identity = benchmarkV3OperatorImageIdentity(JSON.parse(input));
process.stdout.write(`${identity.architecture} ${identity.runtime_fingerprint}\n`);
