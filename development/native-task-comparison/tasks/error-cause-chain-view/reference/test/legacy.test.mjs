import {test} from 'node:test';import assert from 'node:assert/strict';
import {formatError} from '../src/error-view.mjs';test('legacy head',()=>{assert.equal(formatError(new Error('boom')),'Error: boom');assert.equal(formatError(new TypeError('bad')),'TypeError: bad');});
