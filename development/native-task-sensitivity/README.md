# Test-sensitivity prototype and failed diagnostic admission

The opt-in installed capability works in local fixtures. **The eight scheduled
H0/H1 attempts all failed before any model request**, because the prepared
read-only profile lacked `.gitignore` and OpenCode 1.18.26 tried to create it.
The host-only admission fixture had not covered this configuration-directory
write. This was a preparation error, not a Luna result or an authorization failure.

All eight attempts are retained. None was repeated, replaced or reclassified as
a successful model run. The later profile-preparation correction was checked in
a separate scripted container fixture only. There are zero conditional transfer
runs and zero extra real smokes. Test-quality and full-delivery advantage remain
unmeasured; the component stays off by default. The original project objective
of more correct complete Luna deliveries is not established by this stage.

Use the [installed capability](../../docs/native-task/SENSITIVITY.md) through
`HARNESS_TASK_SENSITIVITY=1` with direct, independently of A/B. The standard
StrykerJS 10.0.0 engine lives in the tool profile. The bounds, original input
selection and balanced order are in [PLAN.md](PLAN.md), and the pre-result
quality criteria are in [RUBRIC.md](RUBRIC.md).

## Local observations

These are development and program-control observations, not model evaluations.
The mechanism generated standard mutations from source; it imported neither
the historical diagnostic mutations nor an evaluator.

| Example | Observation | Interpretation |
| --- | --- | --- |
| Numeric boundary fixture | Weak suite accepts `n >= 2` changed to `n > 2`; adding an API assertion at 2 rejects it while the original code passes | Useful sensitivity feedback and fresh test rerun |
| Saved denque slot 27 | Weak suite accepts `_copyArray(false)` changed to `_copyArray(true)` in removeWhere; an ordinary empty-queue regression rejects it | Predicate must visit zero original entries on an empty deque; this is useful, but does not close the separately known capacity-test gap |
| Same denque patch | Emptying the exception message survives | The task requires an Error but does not fix its message; no new assertion is demanded |
| Saved quick-lru slot 37 | Baseline passes; all eight selected variants are rejected by its AVA suite | Selected operators do not expose the known default-TTL omission. This is not proof that its regression is sufficient |
| Suitable quick-lru/denque controls | Baselines pass; some standard variants survive | No overall “bad tests” verdict; inspect each changed public property individually |
| Equivalent max fixture | `<` changed to `<=` survives a complete small numeric input grid | Equivalent behavior on this API/domain, not a missing assertion |
| Red baseline / missing import | Baseline command rejects before variants | No sensitivity conclusion; an import error is not an assertion catching a mutation |
| Timeout / cancellation / exhausted budget | Children terminate; partial/missing observations are explicit | No synthetic pass or uncontrolled retry |
| No supported operator / unsupported path / denied command | No mutation test is executed | Scope/permission limitation, not task completion |

The [retained local observations](local-observations.json) include actual diffs,
exits, diagnostics, snapshot identities and costs. The [denque regression](denque-empty-regression.js)
uses only the project API and was run in a fresh ordinary test copy. Correct
source with the stronger suite passes. A scripted installed fixture also
delivered and independently reapplied a patch containing a boundary regression,
without mutation code, engine paths or administrative markers.

The initial Stryker adapter location conversion was corrected during local
development: its exported locations are zero based. The local fixture caught
the resulting syntax errors before any diagnostic slot was admitted. Later
installed-path checks verified inheritance of dependencies from the original
repository into the nested author worktree and fresh diagnostic copies.

## Eight attempts, zero model evaluations

The frozen implementation was `6f514420`. Input/runtime freeze SHA-256:
`4333aa5adc892e05674edd4d59872ebee0f9ee5a8e0a170a6f159ba4686a04f7`.
Both sides received the same original task and unfinished source patch. H0/H1
both use direct with A/B off; H1 alone enables sensitivity and its short
instruction. Settings were OpenCode 1.18.26, `openai/gpt-5.6-luna`, high,
900 seconds per attempt. Actual author execution never began.

| Slot | Case | Arm | Result | Retained capture |
| --- | --- | --- | --- | --- |
| 1 | Weak computed insertion | H0 | Startup exit 1, 0 requests | [facts](attempts/01.json), [input patch](patches/01-case-1-H0.patch) |
| 2 | Weak computed insertion | H1 | Startup exit 1, 0 requests | [facts](attempts/02.json), [input patch](patches/02-case-1-H1.patch) |
| 3 | Weak removeWhere | H1 | Startup exit 1, 0 requests | [facts](attempts/03.json), [input patch](patches/03-case-2-H1.patch) |
| 4 | Weak removeWhere | H0 | Startup exit 1, 0 requests | [facts](attempts/04.json), [input patch](patches/04-case-2-H0.patch) |
| 5 | Computed insertion control | H1 | Startup exit 1, 0 requests | [facts](attempts/05.json), [input patch](patches/05-case-3-H1.patch) |
| 6 | Computed insertion control | H0 | Startup exit 1, 0 requests | [facts](attempts/06.json), [input patch](patches/06-case-3-H0.patch) |
| 7 | RemoveWhere control | H0 | Startup exit 1, 0 requests | [facts](attempts/07.json), [input patch](patches/07-case-4-H0.patch) |
| 8 | RemoveWhere control | H1 | Startup exit 1, 0 requests | [facts](attempts/08.json), [input patch](patches/08-case-4-H1.patch) |

All errors identify `FileSystem.writeFile (/template/.gitignore)`. Every native
process returned 1; native accounting contains no author sessions, tools or
provider requests. Captured source files/modes equal the frozen seeded input.
The linked captures are **supplied input patches, not new author deliveries**.
Q is null (no authored result assessed); D is 0 (no autonomous delivery). The
generic scheduler's raw `finished` status means that all slots were visited,
not that a model evaluation succeeded. The compact [results](results.json)
preserve this distinction.

The original frozen bundle remains unchanged, including its missing file. The
materializer now writes `.gitignore` before runtime startup. The corrected
read-only profile completed one full H1 container fixture: 15 scripted requests,
one native phase, normal final stop, verified termination and 0 real provider
requests. This does not replace any of the eight results. No relay protocol,
permissions, user default or task deadline was changed to overcome the failure.

## Costs, validation and preservation

[Costs](costs.json) separate the failed batch from retained local diagnostics:

* Eight native startup executions: 5.145 s; cleanup: 0.453 s; preparation and
  capture: 26.602 s. Model requests, tools and tokens are zero because no request
  was submitted, not because usage data was missing. Unknown requests: zero.
* Fourteen retained local observations: 69 project commands, 2.193 s of engine
  time and 48.162 s of measured preparation, 75.661 s total. Earlier iterative
  checks and package preparation were not fully timed; aggregate development
  cost is unknown. These are not the costs of an H1 model run.
* Corrected scripted container fixture: 5.573 s native elapsed time. No monetary
  estimate is inferred.

Targeted adapter checks, native-task checks, A/B compatibility checks, native
materializer checks, scheduler fixtures, the host installed fixture and the
corrected read-only container fixture passed. The source diff was reviewed;
no full platform matrix or manual Actions run was requested or performed.
Local evidence does not stand in for remote CI or model quality.

All eight attempt containers were removed with verified stopped workloads. The
old H00 pauses/outcomes retain their hashes; historical grades and source
artifacts were not rewritten. Slots 43–48 of that campaign remain untouched.
Raw traces, complete projects and private local runtime state remain uncommitted.
The runtime has no imports from this development directory or the evaluator.

The prototype supplies useful local feedback, with explicit limits. The requested
transition from that feedback to a more correct complete Luna patch was **not
observed**. No new formulation or replacement campaign is scheduled.
