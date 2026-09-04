export const task = `Add AbortSignal support to the serial job queue and its public submit helper.
Queue.add(fn, {signal} = {}) must preserve the existing Queue.add(fn) API and Promise result.
Jobs must run FIFO with at most one active job. If a signal is already aborted, reject with an
Error whose name is AbortError and never invoke fn. Aborting a waiting job removes it promptly
without changing the order of other jobs. For an active job, pass the signal into fn(signal)
and reject the caller promptly on abort, but do not release the queue's execution slot until
the underlying fn Promise settles, even if fn ignores cancellation. A late resolve or reject
after abort must not settle the caller twice or become an unhandled rejection. Remove abort
listeners when each job is finished. The public submit(queue, payload, options) helper must
forward the signal to both queue scheduling and execute(payload, signal). Keep ordinary calls,
worker error propagation, and the existing exports compatible.`;

export const files = {
  "src/queue.mjs": `export class Queue {
  #tail = Promise.resolve();
  add(fn) {
    const result = this.#tail.then(() => fn());
    this.#tail = result.catch(() => {});
    return result;
  }
}
`,
  "src/worker.mjs": `export async function execute(payload, signal) {
  if (signal?.aborted) { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
  return payload.toUpperCase();
}
`,
  "src/index.mjs": `import { execute } from './worker.mjs';
export { Queue } from './queue.mjs';
export function submit(queue, payload) { return queue.add(() => execute(payload)); }
`,
  "test/public.test.mjs": `import test from 'node:test';
import assert from 'node:assert/strict';
import { Queue, submit } from '../src/index.mjs';
test('existing public consumer', async () => assert.equal(await submit(new Queue(), 'hello'), 'HELLO'));
test('FIFO and failures preserve capacity', async () => {
 const q=new Queue(), seen=[];
 const a=q.add(async()=>{seen.push('a');throw new Error('worker failed')});
 const b=q.add(async()=>{seen.push('b');return 2});
 await assert.rejects(a,/worker failed/);assert.equal(await b,2);assert.deepEqual(seen,['a','b']);
});
`,
  "README.md": "# Serial jobs\nThe public API exports Queue and submit from src/index.mjs. Jobs execute FIFO and an error in one job must not block later jobs.\n",
};
