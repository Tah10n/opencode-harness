import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {purchase} from '../src/receipt.mjs';test('legacy single purchase',()=>{const s={a:5};assert.equal(purchase(s,[{sku:'a',qty:2}],{a:125}).totalCents,250);assert.equal(s.a,3);});
