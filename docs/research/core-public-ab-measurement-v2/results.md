MODEL-BACKED PRIMARY MEASUREMENT COMPLETE — NO CLEAR DIFFERENCE; REAL-REPOSITORY PILOT INCOMPLETE

# Core versus plain primary A/B result

- Plain successes: 0/60 (0%)
- Core successes: 0/60 (0%)
- Absolute delta: 0 percentage points
- Relative lift: undefined
- Core-only wins / plain-only wins / ties: 0 / 0 / 60
- Paired bootstrap 95% CI: [0 percentage points, 0 percentage points]
- Exact one-sided McNemar p (core > plain): 1
- Exact two-sided McNemar p: 1

## Frozen strata

- small: plain 0/20, core 0/20, delta 0 percentage points
- medium: plain 0/20, core 0/20, delta 0 percentage points
- high: plain 0/20, core 0/20, delta 0 percentage points

## Operational evidence

- Duration median / mean / p90 ms, plain: 118163.881478 / 122855.347787 / 145890.815912
- Duration median / mean / p90 ms, core: 125781.882875 / 129220.892713 / 146870.260021
- Turns plain / core: 553 / 677
- Tool calls plain / core: 735 / 867
- Tokens plain / core: not_observable / not_observable
- Timeouts plain / core: 0 / 0
- Terminal completions plain / core: 60 / 60
- Scope violations plain / core: 0 / 0
- Semantic-oracle failures plain / core: 60 / 60
- Core verification passed / failed / stale / unavailable: 0 / 60 / 0 / 0

## Pilot and safety boundary

The real-repository pilot was incomplete after 12 of 29 pairs and was not used in the primary inference. No pilot efficacy was computed.

regression_free_task_success: not_computed (no_frozen_independent_severity_oracle).

HIGH/MEDIUM/CRITICAL regressions outside the frozen task-specific semantic oracles: not_observable; count=null; rate=null.

On the frozen 60-family public validation benchmark, materialized core changed oracle-validated task success from 0% to 0%: 0 percentage points, paired 95% CI [0 percentage points, 0 percentage points], one-sided exact McNemar p=1.

The real-repository pilot was incomplete after 12 of 29 pairs and was not used in the primary inference. HIGH/MEDIUM/CRITICAL regression safety outside the frozen task-specific semantic oracles was not observable.

Materialized core changed oracle-validated task success relative to plain by 0 percentage points on the completed frozen 60-family validation benchmark; no additional model calls were required.
