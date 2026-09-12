import {test} from 'node:test';import assert from 'node:assert/strict';
import {createNotifier} from '../src/notifier.mjs';test('notification delivery',async()=>{const seen=[];const notify=createNotifier({email:m=>{seen.push(m);return 'ok';},log:()=>null});assert.deepEqual(await notify('hello',['email']),[{channel:'email',result:'ok'}]);assert.deepEqual(seen,['hello']);});
