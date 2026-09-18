# Check obligations and terminal denial

This code-only revision continues draft PR #25 from
`3ce5139480a41517853f8518ba71df7232af0d9d`. It addresses two observed controller
problems. Real model/provider calls and manual Actions runs for this revision: **0**.
The historical Luna/high outcome remains **P 1/2, H 0/2**.

## Obligation versus execution history

Replay used the preserved reconnect/H D1 source and 99 native tool events. The
original task explicitly required:

```sh
node --test --test-name-pattern=reconnect packages/connector/test/config.test.mjs
```

Before an edit, the author also ran the same route with `--test-concurrency=1`.
After the edit, the original command passed on the current snapshot. The previous
observer retained the earlier variant as unresolved/stale and demanded its rerun.
The new observer records that variant as additional execution and produces no such
correction reason. It does not normalize away concurrency or prove command equivalence.
If both forms are explicitly required, both remain required.

All execution records remain available. The earlier flagged-command failure and
its subsequent same-command pass are retained. Uninterpreted failures from compound
Git reads, `git diff --stat` and the offline `corepack pnpm verify` attempt remain
limitations in the replay. A different passing command is not evidence that those
failures were fixed. Repeated substantive failures retain every occurrence without
multiplying the same scheduling reason or defeating the existing no-progress bound.

This replay is a new program check, not a successful model continuation. It does not
repair the delivered disconnected-scenario starting state, change its whole-delivery
assessment, or attribute the historical 403 test to this revision.

## Fatal denial and tool termination

The plugin saves the first terminal cause and facts before invoking existing native
`session.abort`. Duplicate events do not overwrite the cause or send duplicate aborts.
Cancellation racing with session creation includes the newly registered session.
The existing native `chat.params` hook blocks subsequent child and parent model
requests after the fatal decision. The workflow preserves `permission_denied` as an
incomplete terminal outcome even when the native prompt returns an abort error.

Before emitting a terminal patch, the plugin waits for the prompt and requested
aborts, reads native tool states, and requires no pending/active tools. An abort
failure leaves termination unverified and the terminal patch absent. The worktree
is retained. Once the result is sealed, late native events cannot rewrite its facts
or patch. None of this claims known server cost for a request already submitted.

## Exact runtime/H directory refusal

The retained denied native call was `bash` with:

```text
command: git status --short; git diff --stat; git log --oneline -5
workdir: /work/repo/.git/harness-task/80bca183-9838-45cc-a89e-2031bc5ca28a
```

The actual child directory was the `worktree` child of that path. Thus the model
requested the artifact parent, outside its delivery workspace. The active native
rules included `external_directory: * → deny`; limited native tool-output/temp
exceptions did not cover that parent. The stored rejection does not contain the
separate native permission-request pattern, so no additional pattern is invented.

Both `session.create` and `session.prompt` already used the correct delivery directory.
Earlier native glob output returned files under that exact worktree, and an earlier
model call itself supplied the correct `/worktree` path. That earlier concurrent
Git call was rejected by the sequential-tool guard, not external-directory policy.
The saved facts establish the later wrong `workdir`; they do not establish why the
model removed its final path component. No permissions or native directory context
were changed, and no model path was silently rewritten.

The installed regression writes and tests through the actual allowed worktree,
then verifies that a write requested in its parent is still denied. The fixture
uses the native canonical path on macOS (`/private/var`, not its `/var` alias).
No allowlist was expanded to make the test pass.

## Verification

The direct checks are the existing `verify-native-template.mjs`,
`verify-native-review.mjs` and `verify-native-task.mjs`. Controller regressions use
real temporary Git repositories and Node checks, plus controlled native API races
with a real delayed-write process. They cover distinct obligations, narrower filters,
stale edits, unresolved diagnostic failures, unsupported environment prefixes,
primary denial, duplicate cancellation, create/cancel races, failed abort
acknowledgement and immutable terminal evidence after late callbacks.

The installed scripted fixture checks actual native tools and local provider
request counts, rather than injecting `checks_passed`. Its permission case uses
one bootstrap and one author request, plus the initial auxiliary title request:
three scripted provider requests in total, one native abort and zero corrections,
with no parent-summary request after denial. Its external-directory case first executes
two allowed tools, then stops at denial: four workflow requests plus one initial
auxiliary title request. The existing
cancel/deadline scenarios confirm that the observed child process is gone before
a stable terminal patch is available.

All three direct regressions passed. All 23 installed scenarios passed, with
162 scripted provider requests (139 workflow requests and 23 auxiliary title
requests), and zero real provider requests. The preserved-event replay reproduced
the old stale obligation and removed that reason with the new observer.
One scoped final diff review and `git diff --check` cover this revision. No historical
patch, grader, task, model setting, deadline, correction limit or usage was changed.
No full historical hash audit, benchmark, continuation, release or default change
was performed.
