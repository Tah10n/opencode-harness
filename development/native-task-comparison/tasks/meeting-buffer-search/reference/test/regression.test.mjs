import {test} from 'node:test';import assert from 'node:assert/strict';
import {findMeeting} from '../src/meeting.mjs';test('common gap and buffers',()=>assert.equal(findMeeting([[[20,25],[0,5]],[[8,10]]],5,4,1),11));test('half-open boundary',()=>assert.equal(findMeeting([[[10,20]]],5,5),5));
