# Offline subscribe: one additional complete delivery with a supported repair chain

TYPE_COMPAT ON delivered a complete subscribe patch; OFF delivered a portable
patch that lacks the required contextual receiver typing. ON received a real
compiler counterexample and restored an old valid returned-callable signature
without removing the new feature. This is a positive signal on this known task.
Keep TYPE_COMPAT experimental/default-off, with no runtime change or automatic
next campaign. One development pair does not establish stable lift, transfer to
another project, or superiority over ordinary OpenCode.

## Frozen conditions and preparation

Measured candidate: `e18db1fe10223db52dcc05b3e769bca140367c2b`, matching the remote
branch before preparation. Existing draft PR #25 and its base
`feat/native-template-regression-workflow` were retained. Product runtime and
materialized core instructions came unchanged from that SHA. Only bounded
campaign wiring was added to the existing development recorder/scheduler;
transport, relay schemas, retry/stop policy and product dependencies were not
changed.

Both runs used OpenCode 1.18.26, `openai/gpt-5.6-luna`, high reasoning effort,
1800 seconds for the whole task, direct strategy, and CONTEXT/CHECKS/SENSITIVITY/
INVESTIGATION/COMMAND_HINTS/EXTRA_ATTENTION=0. TYPE_COMPAT alone was 0/1. ON used
returned-callable-strict-v1 with at most two analyses, 60 seconds each and 120
seconds total inside the task deadline. No hidden OFF analysis was performed.

Source: public EventEmitter3 `b0144e940ace8add8f335a8adfbed9284eb419f3`, archived
without history or prior patches. Each container initialized a new Git baseline.
The original full [task A](../native-type-compat-comparison/tasks/A.md) was
preserved byte-for-byte and followed by the same short environment block.
[Freeze evidence](frozen-inputs.json) separately records the original task hash,
actual prompt hash, exact environment block, inputs and configuration hashes.
The new prompt is deliberately not claimed to equal the historical prompt.
Evaluator, reference, historical results and other-slot patches were absent
from model mounts and Git history.

The existing offline override denied webfetch globally and for build. Other
model/provider/permission settings were preserved in a separate normal config
file; no existing inline override was discarded. Both fresh build sessions
used the CLI without resume, attach or custom session permissions. All 60 real
parent/author work-request inventories, including after tool results, omit
webfetch and retain read/apply_patch/bash/glob/grep. Two additional title
requests had no tools. No schema filtering occurred.

The existing read-only, user-node container used `--network none`, dropped
capabilities, no-new-privileges, init/reaping and bounded resources. The only
external model path remained the authorized host transport. Existing host
OpenCode processes and Docker workloads were absent before the pair. No old
request/session was resumed and no availability request was made.

Node was v24.19.0 in the installed pinned image
`sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6`.
TypeScript was 6.0.3; API hash:
`569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39`.
The diagnostic API used `lib/typescript.js`; ordinary author checking used the
real CLI `lib/tsc.js` through `/usr/local/bin/node`, with the exact strict flags
in [PLAN.md](PLAN.md). No global compiler, PATH change, downloaded npx package,
new wrapper or package.json trigger was introduced.

A local scripted OFF/ON preflight used the same launcher, native delivery
worktree, user, mounts, permissions, offline override and capture. Native Bash
ran Node; a semantic consumer importing `./index` and using Promise passed;
a real string-to-number error exited 2 with TS2322. Both sides ran runtime,
ESM and build commands. Preparation files were confined to disposable copies.
The scripted ON delivered a generated incompatibility and a clean second
observation after repair, bound to callID/snapshot in actual outgoing requests.
OFF ran no analysis. Both unchanged patches applied and all containers stopped.

One initial scripted preparation failed because the inventory assertion
expected `edit`; this installed Luna inventory exposes `apply_patch`. The
assertion was corrected to the actual preserved tool, and the complete local
preflight passed before any real request. Failed preparation artifacts remain
local. Scripted requests are not paid attempts or model-quality evidence.

Independent acceptance was reused from native-type-compat-comparison/A and
frozen before real requests. The corrected reference and alternative passed;
baseline/missing feature, erased types, broken legacy consumers and broken
independent cancellation were rejected. Coverage review also rejects an
otherwise working reference stripped of its required new regressions. No
particular helper, filename, architecture or Error subtype was required.

## Assigned slots and independent evaluation

Q is a complete correct portable patch under the frozen rubric. T requires
normal autonomous delivery and verified stopping. D = Q and T. Internal
incomplete is reported separately; it is not an automatic Q failure.

| Slot | Arm | Q | T | D | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | OFF | false | true | false | Missing contextual `this` typing in subscribe |
| 2 | ON | true | true | true | Complete under independent acceptance |

Both terminal patches were applied without edits in ordinary Git copies.
Neutral IDs n01/n02 were reviewed before revealing the mapping and reading
explanatory traces. See [neutral review](neutral-review.json),
[unchanged OFF patch](patches/A-OFF.patch), [unchanged ON patch](patches/A-ON.patch)
and [machine-readable checks and accounting](RESULTS.json).

Both patches pass the full runtime suite (48 tests), ESM suite (3 tests), build,
independent runtime/CJS/ESM acceptance and legacy consumer typing. Both preserve
existing assertions and add the requested eight runtime regression groups,
consumer tests and lifecycle documentation. Both authors' own positive/negative
type suites compile, but OFF's positive callback explicitly annotates `this`.
That masks the missing contextual API inference: the independent new-feature
consumer fails TS2683 and TS2322. ON passes that same frozen consumer.

Both authors actually ran the prepared ordinary TypeScript CLI successfully,
as well as runtime, ESM and build commands; these are native events, not
external compilation credited to them. Both independently encountered missing
`./node_modules/.bin/mocha` in the delivery worktree and then used successful
npm-script commands. ON also had one failing intermediate runtime regression,
then fixed its author test and passed it. These failures remain in the journal.
Final listed check claims match actual successful events. Neither final author
message lists every intermediate failure, and OFF's overall completion claim
does not overcome its independently observed typing gap.

Both workflow reports remain `incomplete` because the internal project adapter
does not interpret these Mocha/rollup commands as supported successful checks.
Actual exits/output, autonomous stop, independent acceptance and internal
interpretation remain separate. Both author and parent emitted normal stop;
terminal patches, zero remaining tools, local workload termination and relay
removal were verified.

## Compiler contribution and its boundary

ON already implemented contextual subscribe typing in its first declaration
edit, before either compiler observation. That new typing is not attributed to
TYPE_COMPAT. Its first analysis found no difference in the checked old-call
scope. The author later changed listeners() to return callbacks parameterized
by Context, unintentionally rejecting formerly valid bare callback calls.

The second analysis, attached to `npm test`, reproduced TS2684. Its consumer,
callID and snapshot arrived in actual request 30. The model response to that
request explicitly identified the compatibility regression and restored
`listeners()` to `EventListener<EventTypes, T>` while keeping the new typed
subscribe API. Three generated consumers represent one defect, not three wins.
The declaration before analysis is reconstructed and checked against its
captured surface hash; the repair starts at that exact snapshot.

After the repair, the author reran its ordinary type consumers and full
runtime/ESM/build checks. Both diagnostic slots were already consumed, so no
third analysis ran. The stored second observation is correctly marked stale
(`current=false`); its old red status is not a final-code failure or a fresh
post-repair pass. The evaluator independently confirmed final legacy and new
API typing. The author's intermediate intention to rerun compatibility did not
produce a third compiler receipt. [Compiler evidence](compiler-evidence.json)
contains the safe block, declaration hashes, actual next-request receipt,
repair, subsequent checks and final snapshot.

Thus ON adds one full delivery in this pair and compiler evidence demonstrably
helped repair its own introduced old-API regression while preserving the new
feature. OFF failed a different obligation, contextual new-feature typing.
This supports bounded usefulness, not a claim that TYPE_COMPAT created all of
ON's advantage or that ON would certainly have failed without it. There is no
provider-interruption confound in this pair.

## Costs, provenance and limits

| Measure | OFF | ON |
| --- | ---: | ---: |
| Complete task execution | 293.389 s | 376.611 s |
| Local termination cleanup | 0.055 s | 0.054 s |
| Provider requests, including titles | 23 (22 work + 1 title) | 39 (38 work + 1 title) |
| Native tools, including parent harness_task | 39 | 62 |
| Author native tools | 38 | 61 |
| Known input tokens | 681,815 | 1,426,781 |
| Known output tokens | 12,959 | 15,644 |
| Known total tokens | 694,774 | 1,442,425 |
| Cached input subset | 229,376 | 1,001,984 |
| Reasoning output subset | 6,887 | 7,464 |
| Requests with unknown usage / server outcome | 0 / 0 | 0 / 0 |
| Compiler analyses / charged analysis time | 0 / 0 | 2 / 8.110 s |

ON used 83.222 more seconds, 16 more provider requests and 747,651 more known
tokens. Cache/reasoning are included subsets and must not be added to totals.
Compiler analysis charges were 4.174 s and 3.936 s (worker elapsed 3.987 s and
3.770 s); baseline preparation was separately 0.117 s. Captures and all analysis
work occurred inside the task deadline, not extra author time. No reliable
monetary bill is available; no dollar cost is inferred.

Preparation (calibration and scripted local checks), external evaluator runs
and this developing agent's work are separate from those two task totals.
They made zero additional research-provider requests. Their host work is not
represented as free or as part of Luna's usage; developing-agent token/cost
telemetry is unavailable to this report. Container/check logs and filesystem
timestamps remain local; they are not a precise CPU or financial accounting.

Raw bodies/streams and full project/evaluator copies remain in private ignored
local artifacts. Git contains safe extracts/hashes and unchanged patches only;
no authorization headers or credentials were saved by the recorder. Historical
failures and unknown server outcomes remain unchanged and are not replaced or
pooled with this pair. No third run, probe, retry, continuation, runtime/default
change, force push, merge, release or manual Actions was performed.

Targeted preparation/capture, independent acceptance and report-consistency
checks establish this result. They do not establish full aggregate/platform CI
or remove the historical PROCESS_CONTAINMENT_UNAVAILABLE limitation.

Publication validation also passed the existing model-free native-launcher,
CI-scope and historical comparison-result checks, plus script syntax and this
pair's receipt/hash/accounting verifier. At final cleanup, no container of this
pair remained. Unrelated workloads appeared on the shared host after the
pre-run idle check; they were neither stopped nor modified. Wall times are
observed run times, not controlled dedicated-host performance measurements.

The unfiltered `git diff --cached --check` reports 25 whitespace notices on
the immutable `.patch` artifacts: each is exactly a single-space blank context
line required by unified-diff syntax. Patch bytes were preserved. The staged
source/documentation check excluding those two artifacts passes; no whitespace
rule or acceptance threshold was changed to suppress the raw result.
