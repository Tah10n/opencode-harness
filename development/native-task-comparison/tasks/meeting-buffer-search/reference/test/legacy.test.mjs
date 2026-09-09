import {test} from 'node:test';import assert from 'node:assert/strict';
import {findMeeting} from '../src/meeting.mjs';test('one occupied room',()=>assert.equal(findMeeting([[[0,10]]],0,5),10));
