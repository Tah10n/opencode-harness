# Preservation advisory revision 2

The runtime now considers the first confirmed, nonempty, successful selected
test run after production changes. It no longer classifies test origins or
infers missing consumer coverage. The unchanged flag is direct-only,
`HARNESS_TASK_PRESERVATION_NUDGE=1`, default `0`. There is one runtime mechanism.

Работоспособность более общего момента выдачи проверена.
Улучшение самостоятельной работы Luna и полных поставок не измерялось.

## Implementation and boundaries

The production module shrank from 209 to 178 lines. Removed: Node test-body and
production-import analysis; dynamic describe/it/sample directory matching;
`origin=new`; scope-based suppression inferred from earlier old cases. Tests can
be new, modified existing, or unchanged existing. The advisory states a selected
run passed, asks whether a suitable existing behavioral scenario has run, and
explicitly says a prior suitable check needs no repeat. It certifies neither
build freshness, coverage completeness nor a regression.

Added bounded direct project Mocha parsing and the literal `source` nvm-prefix
alternative using the unchanged shared tokenizer. Filters are bounded strings,
not host-executed regexes. Node single-case TAP/spec totals remain strict;
duplicate Mocha totals are now explicitly rejected. Positional files do not
certify the suite inventory loaded by opts. Names come from the full report.

Native admission, matched arguments/callID, completed stable snapshot, initial
user-work baseline, event chain, active/cancellation/deadline checks, once-only
receipt attachment and queue release remain enforced. Plugin, materializer,
command observer, permissions, transport, repair gates, evaluator and common
collector are unchanged. OFF runs with the advisory module physically absent.
No spill tail is read into the author context.

Code growth outside the smaller production module is the required existing-case
Mocha fixture, raw request/patch retention, reuse of the repaired output exporter,
and negative controls. No test-origin system, discovery execution, benchmark or
new dependency installation was added.

## Bounded saved ON replay

[Reproduction](replay.mjs) reads only retained ON events, their saved trajectory
hash, snapshot identifiers and actual revision-1 state; revision-1 command
recognition is imported from immutable Git history. No OFF shadow run, full task,
hidden tests, gold, evaluator output or reconstructed final-diff project enters
the classifier.

[Replay receipt](replay.json): 47 Bash events considered. Four have a recognized
direct Mocha command, full nonempty report, exit 0, stable command snapshot,
matched admission and sufficient recorded time: e53 (2 cases), e65 (2), e104
(49), e110 (8). The first form pass is **e53**, selected by chronological iteration,
not by a hard-coded event, name, library path or sample exception.

Revision 1 rejects these actual direct Mocha commands before its origin analysis.
The historical state remains 47 considered, zero attachments, with
`no_production_change=3`, `scope_or_origin_unknown=31`, and
`unconfirmed_or_changed_execution=13`. Revision 2 form replay has 38 unsupported
commands, four unconfirmed/changed executions, one unsupported/incomplete report,
and the four form passes above. Conservative tokenizer/reporter limitations
remain, including dollar signs in filters and logs interleaved with spec rows.

**Full historical eligibility remains unknown.** Intermediate full snapshots and
configuration bytes for the first form pass were not retained. The available
initial/final snapshots cannot stand in for them. Therefore no full-hook replay,
exact historical first attachment, author receipt or changed choice is claimed.
The six lost historical stdout files are not reconstructed or replaced; old
pair scores, patches, freezes, pauses and not-started slots are untouched.

## Installed OpenCode 1.18.26

[Final safe receipt](installed.json) binds the final materialized module hash to
four local scripted scenarios. The pinned existing Linux image has no external
network; only the predetermined loopback provider is used. No host OAuth or
credentials are read or mounted. Existing archived Mocha 3.5.3 dependencies are
reused without installation. Scripted choices and repairs are fixed in advance.

| Scenario | Actual path | Next request | Portable acceptance | Native observer status |
| --- | --- | --- | --- | --- |
| Mocha | Edit baseline arithmetic case; direct project Mocha; selected pass; old increment fails `3 !== 5`; native production repair; feature/old/full rerun pass | Exact 611-byte advisory in request 8; assertion in request 9 | exit 0 | `incomplete` (Mocha remains outside trusted adapter) |
| Node ESM | Different names/layout; edit baseline case; explicit Node file; old lookup fails; native repair; reruns pass | Exact 624-byte advisory in request 8; assertion in request 9 | exit 0 | `checks_passed` |
| OFF | Same Mocha sequence; advisory module removed from bundle | No block | exit 0; patch byte-identical to ON | `incomplete` |
| Irrelevant check | Mocha feature passes; author chooses constant test; no repair | Advisory delivered; no target failure in chosen check | exit 1; real old-path regression remains | `incomplete` |

Portable patches are applied in ordinary Git clones. Production must equal the
expected repaired implementation (or deliberately broken implementation for the
negative control); old test bytes are unchanged, the feature assertion remains,
file bytes/modes match, and no harness/internal paths appear in the patch.
Original checkout, permitted dirty user line and Git index stay unchanged.
Safe patches: [Mocha](mocha-terminal.patch), [Node](parcel-terminal.patch),
[negative control](irrelevant-terminal.patch). Raw requests and full outputs stay
private under ignored `local/native-preservation-integration/`.

The Node scenario emits the existing deterministic long-output fixture. The
unchanged common `captureOutputs` exporter retains **353,899 bytes**, SHA-256
`20f0acd6e38c39f3a94b84afdd9a19b2621aa2b7b585a15340051f9d8674dfb1`, linked to
native metadata. Bytes match the fixture before the source container is removed.
The hidden middle marker is absent from raw native receipts and all actual
requests. No second collector or repeat of the earlier 34-attempt campaign.

## Costs and attempt accounting

| Final scenario | Scripted requests | Considered / eligible / attached | Additional read attempts | Classification, ms | Project commands, ms | Portable npm test, ms |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Mocha | 14 | 6 / 1 / 1 | 4 | 1.959 | 801 | 122 |
| Node ESM | 14 | 6 / 1 / 1 | 2 | 1.145 | 881 | 178 |
| OFF | 14 | disabled | 0 | not run | 782 | 121 |
| Irrelevant | 10 | 3 / 1 / 1 | 4 | 1.059 | 314 | 217 |

Additional reads include initial opts capture; classification timing is the
`after` classifier duration, not complete host/workflow wall time. Project times
include preparation/long-output commands (94–157 ms), the chosen check, repair
reruns and final check. The chosen old check itself took 111 ms (Mocha), 104 ms
(Node), 109 ms (OFF); irrelevant check 111 ms. These local toy checks do not
predict costs in a real project. Host overhead and test execution are separate;
120 seconds is advice within the total deadline, not free additional time.

All installed attempts, including failure, are retained:

1. `preservation-r2-1789984123276`: 37 scripted requests (14 Mocha, 14 Node,
   9 OFF). Mocha/Node completed; OFF failed because fixture cleanup removed a
   shared dependency directory named like the first scenario. OFF Mocha exit
   127; no irrelevant run. Requests and long output recovered through the common
   exporter before removing this exact container. Docker archive-copy could not
   access its tmpfs; bounded fixture-file export used `docker exec` instead.
2. `preservation-r2-1789984240661`: all four scenarios passed, 52 requests.
3. `preservation-r2-1789984464592`: final materialized runtime after report/bounds
   hardening; all four passed, 52 requests.

Total **141 actual scripted requests**. Real research provider calls, Luna
runs, probes, paid reviewers and new benchmarks: **0**. Scripted token values
are not model usage measurements; no real-provider bill exists for these local
requests. Fixture failure is not reclassified as a pass or omitted. All three
installed containers were removed after evidence export.

## Checks and limitations

- Final advisory unit controls pass: unchanged/changed cases, direct Mocha,
  both nvm spellings, npm route, Node TAP/spec, state/config changes, no new
  production changes, fake/zero/pending/failing/truncated/duplicate totals,
  cancellation/denial, deadline, repeated events, independent instances,
  bounded names and no test-body reads.
- Final native hook controls cover three invalid configurations and seven
  lifecycle cases: concurrency/duplicate, cancellation before attachment,
  denial, OFF, separate workflow, combined optional components, advisory
  persistence error. Assertions must finish inside the scripted prompt;
  workflow exception handling cannot silently swallow a control failure.
- Command-observation regression suite: 23 scenarios passed. Template
  materialization checks passed. Final installed path, syntax and whitespace pass.
- Host native-task composite was interrupted (exit 130) after its initial
  23-scenario output without full completion; that is not a composite pass.
  Host legacy task fixture cannot bind loopback (`listen EPERM`), not passing.
  No containment/loopback investigation or platform-wide matrix was attempted.
- Linux composite attempts also did not pass: first invocation used `/tmp`
  instead of repository cwd and failed to locate `profiles/native/core.md`;
  corrected cwd reached `Cannot capture exact test diff` in the imported
  command-observation check. Both exited 1, made zero provider requests and
  their `--rm` containers were removed. No third attempt or infrastructure
  investigation. The standalone host observation suite passed separately.
- Final diff reviewed; final materialized runtime hash in `installed.json`
  matches the delivered module. Remote publication is verified after commit;
  exact commit/remote details are reported in the task response.

These are local engineering/integration observations, not full aggregate CI,
autonomous model test selection, model-quality lift, release or deployment.
