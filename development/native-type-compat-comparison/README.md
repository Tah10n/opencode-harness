# TYPE_COMPAT: two complete tasks, four direct runs

This development comparison measures whether opt-in old-call compatibility diagnostics add complete deliveries to the same direct workflow. It uses the fixed product candidate `8264ce42ef198580af834dcb09df996ac1274f1d` and two full EventEmitter3 changes: the known subscribe example and a new waitFor/AbortSignal API.

**Result: retain experimental/default-off status; no next campaign scheduled.** Q ties on both tasks. B/ON delivered normally, while B/OFF had a correct recovered patch interrupted by provider overload. No detected incompatibility or compiler-driven repair occurred, so the difference in autonomous delivery cannot be attributed to TYPE_COMPAT.

- [Complete report and four-row comparison](REPORT.md)
- [Frozen tasks, acceptance and limits](PLAN.md)
- [Freeze, local preflight and negative-control results](frozen-inputs.json)
- [Machine-readable outcomes and request accounting](RESULTS.json)
- [Compiler delivery receipt and snapshot binding](compiler-evidence.json)
- [Neutral source review](neutral-review.json)
- [Unchanged delivered/recovered patches](patches/)

Preparation uses existing prepared dependencies, materializer, launcher and isolated containers. No install or compiler download is performed. `prepare.mjs`, `make-calibration.mjs`, `calibrate.mjs`, `preflight.mjs`, `audit-preflight.mjs` and `freeze.mjs` describe offline preparation. `run.mjs` uses the existing transport and stop policy. It must not be rerun for this batch: all four slots were consumed and the last provider error closed admission. A new campaign requires separate authorization.

`neutralize.mjs`, `grade.mjs`, `check-author-types.mjs`, `account.mjs` and `publish-results.mjs` retain patch quality, normal delivery and provider knowledge as separate facts. Full raw streams and evaluator copies remain local, outside model mounts. This folder does not change the product runtime, user defaults, historical references or earlier experiments.
