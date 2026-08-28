#!/usr/bin/env node
import path from "node:path";

import { issueBenchmarkV3ReviewReceipt } from "../lib/benchmark/v3-operator-issue.mjs";
import { absoluteOperatorArgument, parseBenchmarkV3OperatorArguments, printOperatorResult,
  requiredOperatorArgument } from "../lib/benchmark/v3-operator-cli.mjs";

const values = parseBenchmarkV3OperatorArguments(process.argv.slice(2));
printOperatorResult(issueBenchmarkV3ReviewReceipt({
  sourceRoot: path.resolve(values.get("source-root") ?? process.cwd()),
  reviewer: requiredOperatorArgument(values, "reviewer"), resultPath: absoluteOperatorArgument(values, "result"),
  receiptPath: absoluteOperatorArgument(values, "receipt"),
}));
