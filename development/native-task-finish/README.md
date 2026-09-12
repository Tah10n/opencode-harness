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

## Current hypothesis: a focused check before implementation

`HARNESS_TASK_STRATEGY=check-first` replaces the fresh finisher with regression
preparation followed by implementation in the same author session. The original
request reaches both phases verbatim. Preparation obtains one meaningful observation
through an affected public path, then yields to implementation instead of preparing
the full regression suite. The second phase implements all code, consumer coverage,
tests and documentation while treating generated expectations as hypotheses. The
exact delivery root is supplied as tool context; native permissions remain unchanged. There is
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
