---
name: global-debugging
description: Use when debugging failing tests, runtime errors, regressions, flaky behavior, logs, repro steps, or root-cause isolation
license: MIT
compatibility: opencode
metadata:
  workflow: debugging
---
## Approach

1. Restate the symptom and expected behavior.
1. Get a minimal repro: command, input, environment.
1. Collect evidence: versions, logs, stack traces, config.
1. Isolate: reduce to the smallest failing case.
1. Identify the most likely root cause with evidence.
1. Apply or propose the smallest fix, then verify with the closest relevant command.

## Evidence checklist

- OS + runtime versions
- Exact command(s) run
- Full error output (not paraphrased)
- Recent changes (git diff / last commits)
- Boundary check: callers, config, environment, and tests nearest to the failure
