#!/usr/bin/env node
import path from "node:path";

import { commitBenchmarkV3HoldoutSelection } from "../lib/benchmark/v3-operator-issue.mjs";
import { generateBenchmarkV3ExternalSamplingFrame } from "../lib/benchmark/v3-operator-frame.mjs";
import { absoluteOperatorArgument, parseBenchmarkV3OperatorArguments, printOperatorResult } from "../lib/benchmark/v3-operator-cli.mjs";

const values = parseBenchmarkV3OperatorArguments(process.argv.slice(2));
const sourceRoot = path.resolve(values.get("source-root") ?? process.cwd());
const provenanceBundle = absoluteOperatorArgument(values, "provenance-bundle");
const semanticRuntimeRoot = absoluteOperatorArgument(values, "semantic-runtime");
printOperatorResult(commitBenchmarkV3HoldoutSelection({
  sourceRoot,
  custodyRoot: absoluteOperatorArgument(values, "custody-root"),
  outputDirectory: absoluteOperatorArgument(values, "output"),
  authorityPath: absoluteOperatorArgument(values, "execution-authority"),
  samplingFrameFactory: () => generateBenchmarkV3ExternalSamplingFrame({ sourceRoot,
    provenanceBundle, semanticRuntimeRoot }),
  campaignCustodyDirectory: absoluteOperatorArgument(values, "campaign-custody"), ownerUid: 0,
}));
