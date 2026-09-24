import {test} from 'node:test';import assert from 'node:assert/strict';
import {adjustColor} from '../src/color.mjs';test('adjust color',()=>{assert.equal(adjustColor('#000',1),'#ffffff');assert.equal(adjustColor('#fff',-1),'#000000');assert.equal(adjustColor('#123456',0),'#123456');});
