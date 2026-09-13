# Native task development cycle

This new cycle starts at PR #25 head `97b384134b16c5e38fdbae6054fd938c74049d88`.
Historical campaigns remain closed. The allowance is 48 development runs, including
paid smokes, and conditionally one independent 40-pair evaluation. All scored stages
use OpenCode 1.18.26, `openai/gpt-5.6-luna`, high, 900 seconds for the entire task.

## First candidate: fresh completion

Candidate `db7f374f56f2828f6372bf72ae1841ca71ae54fd` used an initial author followed
by a fresh finisher. Twelve new runs covered six tasks: catalog caching, dual-module
configuration, atomic queue batching, lazy bounded draining, connector protocol
error integration and extraction of the installed HTTP transport.

Independent patch assessment accepted H 6/6 and P 5/6. The one P failure omitted
explicitly required invalid-input regressions through both rendering consumers;
its behavior checks passed. All six H initial-author patches were already complete.
The finisher added some useful assertions and documentation but did not change any
full-patch outcome. Total time was H 3173.582 seconds versus P 1216.365 seconds;
provider requests were H 222 versus P 110. Extra compute is not an architecture-only
comparison. These small development results do not establish superiority.

Operational outcomes differ from patch suitability. The last H run timed out in
the finisher: all local processes stopped, but its complete final code was captured
by the observer rather than delivered as a native terminal patch. One interrupted
request has unknown usage. A public P capture initially failed on supplied dependency
links; its stopped output was recovered offline by excluding only supplied root
node_modules, with the original archive and failure retained and no paid retry.
A large H native report was truncated by OpenCode; full artifacts remained intact.

This candidate is not promoted. A single winning task, a redundant costly phase and
one missing native delivery do not meet the readiness conditions. No independent
run has started and no old campaign has been revived.

## Second candidate: broad regression preparation

Candidate `e0728deab37f16aa1676a81bc0b4cd651ebe3606` completed five new P/H
pairs: three public p-limit API/state changes, dual-module configuration and
revoked connector recovery. Full deliveries were H 4/5 and P 4/5: one win, one
loss and three ties. The win supplied explicitly required render-consumer tests
omitted by P. H selected an incorrect Bash workdir in that run, so its checks
were performed only by the external evaluator; the denied operation was not
replayed. The recovery H run stopped during preparation after a stream error,
leaving tests and documentation without implementation. That failed outcome is
retained, while P completed the task.

The interrupted stream had already recorded a completed provider response and
full usage. Local execution and forwarding stopped before any further slot. The
development runner now distinguishes an observed completed response from an
unknown submission while retaining the transport error and stopping that task;
this does not replace the failed H outcome. No authorization or quota refusal
was bypassed. Original traces and the resolution evidence remain in local artifacts.

H used 2040.007 seconds versus P 1675.547 seconds, with 125 versus 136 provider
requests. On the AbortSignal task, H preparation alone took 494.546 seconds,
exceeding the entire P run's 467.779 seconds; both final patches were complete.
The broad preparation stage has not justified its cost or met independent-evaluation
readiness. Twenty-two development runs have completed across both candidates.

## Third candidate: focused preparation and absolute root guidance

Candidate `c962d30ad495357df40e5bb3295f8d5bec093008` completed five development
pairs: legacy runtime migration, dual-module configuration, catalog caching,
HTTP transport extraction and early iterator closure in public p-map. H and P
each supplied 3/5 full patches: one win, one loss and three ties. The H win
rejected explicitly supplied undefined indentation as required; P accepted it.
Two H attempts stopped after the model mistyped the random worktree identifier
in a native read path. Their permission denials remain terminal. P on the
iterator task stopped on a transport error before applying any code. Neither
iterator attempt supplied a patch. No failed attempt was replaced.

H used 1271.391 seconds and 111 requests; P used 1653.730 seconds and 102
requests. Each arm has two requests with unknown usage. These totals include
early failures and a P migration timeout whose saved patch was complete; they
are not evidence that H solves complete tasks more cheaply. H delivered three
native terminal patches. The full task comparison remains tied and does not
meet independent-evaluation readiness. Thirty-two development runs have
completed; no independent run has started.

The existing installed preflight already used native relative read/edit paths,
an omitted glob directory and Bash's delivery-root default. It recorded a real
red-to-green test transition, left the original source unchanged and delivered
an applicable patch. The next revision uses this verified native capability in
the author's guidance to avoid copying the UUID. It changes no task identifiers,
path aliases, native tools or denial rules. The failed runs and interrupted
requests remain in the development record.

The subsequent relative-path guidance revision was measured on one fresh iterator
pair. P delivered a complete patch with AVA regressions and README coverage in
499.624 seconds (39 requests, 56 tools). H delivered only a focused regression
before another UUID typo in an explicitly supplied Bash workdir caused native
permission termination, after 92.977 seconds (9 requests, 19 tools). Usage was
known for both. Relative reads worked, but suggesting an omitted Bash workdir
did not prevent the model from copying an absolute one. All 34 attempts remain
counted; the prepared following batch was not started. This revision had one
loss and no win, so it was not promoted.

A zero-provider installed check confirmed that native Bash also accepts the
explicit relative `workdir: "."` and runs the delivered project check there.
The next guidance revision requests that form for root commands and relative
subdirectory paths when needed. It removes the redundant absolute root from
the additional prompt; the standard native cwd and workspace context remain.
No tool arguments are rewritten and no denied call is retried.

The explicit dot-workdir revision was then checked on two fresh development
pairs. Dual-config was complete for both arms. Legacy migration was complete for
P, while H stopped on an out-of-range native read during implementation. H was
1/2 and P 2/2: one loss and one tie. H used 364.779 seconds, 42 requests and
89 tools; P used 767.399 seconds, 60 requests and 96 tools. Usage was known for
all four attempts. Thirty-eight development runs are retained; no independent
run has started.

The legacy failure exposed a separate controller defect: the failed read had a
matching before hook, terminal timestamps and an unchanged snapshot, but other
admitted read/grep calls were still finishing. A local reproduction confirmed
that the exclusive-error condition stopped this normal native interaction.
The corrective change permits that completed read error only alongside identified
admitted source reads on the same snapshot. Queued writers remain blocked until
all reads finish; unknown live tools, missing timestamps, changed state and native
permission denials still stop the workflow. The original failed run remains a
loss, and this control-flow repair alone establishes no task-quality advantage.

## Retired phase hypothesis: focused observation with native relative paths

`HARNESS_TASK_STRATEGY=check-first` replaces the fresh finisher with regression
preparation followed by implementation in the same author session. The original
request reaches both phases verbatim. Preparation obtains one meaningful observation
through an affected public path, then yields to implementation instead of preparing
the full regression suite. The second phase implements all code, consumer coverage,
tests and documentation while treating generated expectations as hypotheses. The
author is guided to use repository-relative native paths and an explicit dot Bash
workdir at the project root. Native permissions remain unchanged. There is
no verdict schema, selector, mandatory H1 prompt or report-driven correction loop.
Default D remains unchanged. Native tools, worktree isolation, cancellation and
shared deadline remain the existing implementation.

Separately, the native return is compacted to avoid the observed output truncation.
Full reports stay in artifacts; the displayed result includes actual successful
native commands, limitations and the terminal patch path when safely available.
This reporting fix is not counted as a code-quality gain.

The development tasks span public queue/limiter APIs, connector integration and
state recovery; an additional calibrated case covers legacy state-layout migration
and fresh-process runtime loading. Requirements and acceptance are fixed before each batch; inputs and
candidate bytes remain fixed within a batch. Every outcome is retained. Promotion
requires useful full deliveries across different tasks and a small repeat of the
same candidate, with no ignored serious regression. No required repair count or
plain-success interval is imposed.

Private inputs, captures, preparation incidents, grades and the complete accounting
remain under `local/native-task-finish-20260912/`. They are excluded from installation.
Runtime imports no development/evaluator code. Local/model-free validation, measured
patch suitability, operational completion and independent evidence remain separate.

## Current hypothesis: one complete author pass with conditional observations

Candidate `c5b999b1db6241a6be11804b22f934653c9d2344` completed two pairs without
native execution failure, but full delivery remained tied: H 1/2, P 1/2. Both
legacy migration patches were complete. Both iterator patches passed the calibrated
behavior observer and their delivered AVA/type checks, but omitted a meaningful
regression for closure after `next()` resolves while its returned input value is
still pending. Separate mutations removing only that guard passed each delivered
suite and failed the same independent observer. The original task explicitly
required late pulls/values coverage; neither scored patch nor evaluator changed.

H used 1518.277 seconds and 120 requests versus P 1061.126 seconds and 70 requests.
All usage is known for these four runs. H's mandatory preparation consumed244.006
seconds and did not improve the full outcome. Forty-two development runs remain
accounted for, and no independent run has started.

The next opt-in `HARNESS_TASK_STRATEGY=direct` reuses the existing complete author
prompt and its conditional technique for observing actual state before a transition.
It removes both mandatory preliminary preparation and automatic corrective replies
from this path. The author can implement and test while investigating; it need not
finish an artificial phase before production work. This specifically tests whether
that existing observation technique is more useful within normal implementation
than as a fixed preliminary pass. The original full task, native tools, relative
paths, selected model, shared deadline, worktree and terminal patch are preserved.
D and check-first remain compatible; no default is changed.

The six remaining development attempts are allocated to queue draining, revoked
connector recovery and a same-version repeat of recovery. These choices are fixed
before their outcomes. This revision still needs installed validation and actual
full-delivery evidence; removing stages alone does not meet the goal.
