# Full-task preparation blocked before model execution

The assigned fresh ledger run has **not started**. Zero real provider requests,
new scripted requests, investigator sessions or task runs were made. No new M,
child result, task timing or task-quality score exists. Q/T/D are unknown, not
false measurements of an implementation.

## Concrete boundary

The fixed development resolver supports separate author/investigator directories.
However, the existing full-task launcher imports `inspect-full-task/session.mjs`,
whose capture callback immediately follows successful resolution with:

```js
assert.equal(resolved.patch.toString(),fs.readFileSync(out+'/model.patch','utf8'));
```

Its catch writes `native-result-resolution-error.json` with
`kind: "evidence_incomplete"` and skips writing the resolved result receipts.
The callback still returns the collector's success, so this is a contradictory
host classification, not evidence that the resolver itself rejected the result
or that workload stopped unsuccessfully.

The candidate's final installed scripted evidence supplies a concrete
counterexample: terminal and collector patches have different file ordering,
both apply normally, and both reproduce Git tree
`d001dd713ab514b3d2a2b0c1f85ff30b95c06fdf`. Executing the exact wrapper predicate
on those bytes raises `ERR_ASSERTION`. This does not predict that every possible
future patch would fail, but the intended wrapper fails a valid delivery already
available on the measured candidate. A paid run is not used to discover whether
its new patch happens to avoid the defect.

[wiring-verification.json](wiring-verification.json) records immutable source,
archive and patch hashes. [verify-wiring.py](verify-wiring.py) restores only seven
synthetic baseline files and two patches from the existing archive, applies both
in temporary Git repositories and executes the exact predicate. No installed
matrix or project model task is repeated. The temporary repositories are removed
by the verifier and their absence is asserted.

The prior technical follow-up correctly used applied-tree equality in its
verification script. That correction did not change this older full-task capture
wrapper. The historical failed ledger attempt did not reach successful resolution,
so this finding does not explain its T=false or its late cancellation.

## Scope and remaining work

Repairing this comparison changes capture validation semantics; it is more than
assigning a new slot or output path. The current goal explicitly requires stopping
before real requests if an infrastructure correction is needed. Neither removing
the check nor silently substituting a different capture wrapper was done.

The exact task/environment and prior acceptance entry points are hashed in
[manifest.json](manifest.json). There was no existing directory for this assignment
at preparation entry. Candidate materialization, recording preparation, the
pre-model execution freeze, model run and independent ledger assessment are
**NOT RUN** after this blocker. Auth and provider availability are not diagnosed
by an offline check. One [result row](result.json) preserves this preparation
outcome; [costs.json](costs.json) separates zero model-task usage from preparation
and the developing-agent conversation.

Continuation requires authorization outside this stage to correct and verify
the capture comparison before deciding whether to resume the still-unconsumed
assignment. No replacement attempt, runtime repair or mechanism revision is
automatically authorized by this report.

Historical patches, scores, unknown request-130 usage and 4,087.196 seconds remain
unchanged. Runtime, prompts, watchdog, resolver, recorder, dependencies, defaults
and scoring are unchanged. All new files are small development-only evidence;
no private streams, source copies or dependencies are added to Git.
