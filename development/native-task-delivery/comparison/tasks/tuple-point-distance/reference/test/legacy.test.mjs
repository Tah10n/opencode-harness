import {test} from 'node:test';import assert from 'node:assert/strict';
import {distance} from '../src/points.mjs';test('records',()=>assert.equal(distance({x:0,y:0},{x:3,y:4}),5));