Extend this persisted outbox with asynchronous dispatch and safe lifecycle.

Keep enqueue(id,payload), snapshot() and counts(). IDs must be nonempty strings.
Payloads, snapshots and returned records are detached copies. Duplicate IDs
return the existing record without consuming sequence numbers, overwriting the
payload or resending a sent record. Sequences begin at 1 and survive reopening.

Add drain({limit=Infinity}={}) returning a Promise of {sent,failed,remaining},
where each array contains IDs. Nonnegative safe integer limits and Infinity are
allowed; reject other limits with RangeError. Process at most the first limit
pending records in sequence order as observed at drain admission, one at a time.
New records enqueued during dispatch are left for the next drain. Overlapping
drains join one active drain (the first call's limit wins), with no duplicate
send. Before calling await send({id,payload,sequence}), persist status:'inflight'
and increment attempts. A successful send persists status:'sent',lastError:null;
a rejection persists status:'pending',lastError:String(error.message ?? error),
reports failed, and proceeds to other selected records. No retry inside a drain.
remaining lists current pending IDs in original insertion order. counts.pending
includes inflight work; counts.sent includes only acknowledged records.

On construction, recover persisted inflight records to pending while preserving
attempt counts. A reopen never re-sends sent records. The adapter should use ID
as its idempotency key: a crash between send and persistence can replay delivery.
No impossible exactly-once guarantee across this gap is required.

close() immediately closes admission, awaits an already admitted drain through
its selected batch, and is idempotent. After close, enqueue throws Error and
drain rejects Error. All store failures propagate; do not label a failed save as
acknowledged. Preserve enqueue's canonical record fields and legacy snapshots.
No sleeps or network are needed: tests use deferred Promises. Run npm test.
