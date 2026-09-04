export const task = `Extend client configuration with a structured retry policy, keeping legacy callers compatible.
normalizeConfig(input = {}) must accept legacy retries as a non-negative integer and the new
retry: {attempts, delayMs} object. Default attempts is 3 and default delayMs is 0. When both are
provided, retry.attempts wins over retries, including the explicit value 0. Reject negative,
fractional, non-finite or non-numeric values for attempts/retries/delayMs with TypeError; an
explicit invalid legacy retries still must be rejected even if retry.attempts overrides it.
Do not mutate caller objects. Preserve timeoutMs default 1000 and its existing validation.
Return the legacy retries field alongside retry so older consumers remain compatible.
createClient must pass the normalized policy through transport without silently reinstating
defaults. Transport retries only rejected attempts, makes at most 1 + retry.attempts calls,
waits retry.delayMs between failures via the provided async sleep function, and never sleeps
after the final failure or before the first call. Success stops immediately and the last
error is rethrown unchanged. Defaults apply when a field is absent, not when it is zero.
Keep all exports from src/index.mjs working.`;

export const files = {
  "src/config.mjs": `export function normalizeConfig(input = {}) {
  const timeoutMs = input.timeoutMs ?? 1000;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('invalid timeoutMs');
  return { timeoutMs, retries: input.retries ?? 3 };
}
`,
  "src/transport.mjs": `export function transport(send, settings) {
  return async function request(payload) {
    let last;
    for (let i=0;i<=settings.retries;i++) {
      try { return await send(payload, {timeoutMs:settings.timeoutMs}); }
      catch (error) { last=error; }
    }
    throw last;
  };
}
`,
  "src/client.mjs": `import { normalizeConfig } from './config.mjs';
import { transport } from './transport.mjs';
export function createClient(send, input = {}, sleep = ms => new Promise(r=>setTimeout(r,ms))) {
  const config=normalizeConfig(input);
  return { request: transport(send, {timeoutMs:config.timeoutMs,retries:config.retries}), config };
}
`,
  "src/index.mjs": "export {createClient} from './client.mjs';\nexport {normalizeConfig} from './config.mjs';\nexport {transport} from './transport.mjs';\n",
  "test/public.test.mjs": `import test from 'node:test';import assert from 'node:assert/strict';
import {createClient,normalizeConfig} from '../src/index.mjs';
test('old successful caller',async()=>assert.equal(await createClient(async x=>x).request('ok'),'ok'));
test('legacy retry count',async()=>{let calls=0;const c=createClient(async()=>{if(++calls<3)throw Error('temporary');return calls},{retries:2});assert.equal(await c.request('x'),3)});
test('timeout validation',()=>assert.throws(()=>normalizeConfig({timeoutMs:0}),TypeError));
`,
  "README.md": "# Retry client\nPublic exports are normalizeConfig, transport, and createClient. Existing callers use retries and timeoutMs. Errors from the last failed send preserve identity.\n",
};
