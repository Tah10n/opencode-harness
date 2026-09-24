# Node test failure replay

This is model-free development evidence for the existing native workflow. It
neither resumes nor changes the closed `incomplete_quota` comparison, its rubric,
255-state assessment, or any historical outcome. No real model calls or manual
Actions runs are part of this change.

## Observed historical boundary

Read only: the function-receiver-wrapper original task, saved B review/candidate,
added test, native tool events and admissions. The task includes ordinary callable
functions and preserves return/throw identity; it does not exclude own properties
on functions. The saved source invokes the mutable `apply` property.

| Actual command | Exit and result | Admission |
| --- | --- | --- |
| `npm test` before the added regression | 0; three tests passed | Existing preservation evidence |
| Concurrent `npm test` immediately after test editing | Rejected before execution by sequential guard; no exit code | No executed test |
| `node --input-type=module -e "…try { console.log(…wrapped call…) } catch (…) { console.log(…) }"` | 0; printed TypeError | Cited in initial reproduction; rejected |
| `npm test` after test editing | 1; three pass, one TypeError from source in the fourth test callback | Real project failure, but not the disposition's cited command |
| `node --input-type=module -e "…assert.strictEqual(wrapped(),42)"` | 1; TypeError before assertion comparison | Cited after correction; rejected |

The three executed post-edit commands have equal before/after snapshot
`cd11c58015918168d6f0b494df315cb9db48ab9bf603e719744401c4754fd10d`.
The historical admission reason was `no_executed_failing_assertion`; repairs=0,
evidenceCorrections=1. The old predicate accepted some TAP `not ok` forms and
AssertionError output, including this saved npm/spec failure (its summary contains `fail 1`). A read-only
replay of the original predicate confirms: printed inline=false, npm test=true,
throwing inline=false. The concrete historical refusal was the cited inline
command, not a blanket rejection of TypeError. The new correction instruction
makes the project-runner route explicit; the observation rule replaces loose
error-word recognition with runner/callback/source evidence.
No historical command ID has been relabelled or used as current evidence.

## New observation rule and limits

The native after-hook records Node test evidence alongside the unchanged output.
It recognizes a direct `node --test` command or a simple `npm test`/`npm run test`
script resolving to that runner, with the default spec or TAP reporter. No inline
JavaScript, shell chain, custom reporter, preload or npm lifecycle hooks are
accepted by this bounded observer. Unrecognized routes remain insufficient.

A current completed exit-1 test must contain a runner failure with a test callback
stack. Assertion code is read from the runner diagnostic; an exception must
originate in a local non-verification file. Import/file-load failures, hook stacks,
artificial throws in the test, and mere printed error text are insufficient.
Exception class names alone do not decide: a source operation throwing an error
with code ENOENT can still be an unexpected behavioral failure. Some legitimate
unrecognized stack shapes remain unverified rather than receiving guessed evidence.

This establishes the shape and origin of an executed failure, not semantic truth.
The author must still establish the input and expectation from the original task
or public contract; an unverified/rejected disposition does not admit repair.
The existing snapshot, current-stage ID, permission, scope and cancellation checks
remain necessary. The correction instruction requests an ordinary project test;
it does not ask the author to turn a real exception into AssertionError.

## Scripted installed replay

The fixture copies the saved source, original task and finding into a temporary
project. The first three saved tests remain byte-for-byte intact. The saved fourth
test is added separately during the existing correction stage. Scripted provider
messages use actual host call IDs and execute native bash commands:

1. Insufficient inline diagnostic prints error text, exit 0.
2. One correction adds the project regression; `npm test` exits 1 with TypeError
   from the saved production source (three pass, one fail).
3. Controller admits one repair. A real fixture-only source edit replaces mutable
   method lookup with direct intrinsic invocation.
4. `node --test test/exception.test.mjs` passes, then `npm test` passes all four
   tests after the final edit. The final patch and source bytes are checked.

A separate scenario keeps the correction insufficient: incomplete, zero repairs.
An already correct candidate with passing tests receives zero repairs. These are
scripted controller results, not a claim that a real model would make the repair.

`verify-native-task.mjs` additionally runs real Node processes for assertion
mismatch, unexpected TypeError, async rejection, correct implementations,
assert.throws/assert.rejects, import/setup/hook errors, print-only and fake error
text. It tests current IDs, snapshots, grounding and denial through admissions.
The unrelated lookup/service example tests the same rule without benchmark names.
