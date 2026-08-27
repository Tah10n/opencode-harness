#!/usr/bin/env node
import path from "node:path";

import { materializeBenchmarkV3ExternalHoldout } from "../lib/benchmark/v3-operator-holdout.mjs";
import { absoluteOperatorArgument, parseBenchmarkV3OperatorArguments, printOperatorResult } from "../lib/benchmark/v3-operator-cli.mjs";

const values = parseBenchmarkV3OperatorArguments(process.argv.slice(2));
printOperatorResult(materializeBenchmarkV3ExternalHoldout({
  sourceRoot: path.resolve(values.get("source-root") ?? process.cwd()),
  custodyRoot: absoluteOperatorArgument(values, "custody-root"),
  outputDirectory: absoluteOperatorArgument(values, "output"),
  authorityPath: absoluteOperatorArgument(values, "execution-authority"),
  commitmentPath: absoluteOperatorArgument(values, "holdout-commitment"),
  campaignReportPath: absoluteOperatorArgument(values, "campaign-report"),
  familyPoolPath: absoluteOperatorArgument(values, "family-pool"),
  semanticRuntimeRoot: absoluteOperatorArgument(values, "semantic-runtime"),
  provenanceBundle: absoluteOperatorArgument(values, "provenance-bundle"),
  holdoutRoot: absoluteOperatorArgument(values, "holdout-root"), ownerUid: 0,
}));
