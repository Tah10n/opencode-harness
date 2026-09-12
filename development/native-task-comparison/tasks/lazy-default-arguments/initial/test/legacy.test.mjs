import {test} from 'node:test';import assert from 'node:assert/strict';
import {getSetting} from '../src/settings.mjs';test('existing fallback and presence',()=>{assert.equal(getSetting({a:0},'a',2),0);assert.equal(getSetting({},'a',2),2);assert.equal(getSetting({a:undefined},'a',2),undefined);const f=()=>1;assert.equal(getSetting({},'a',f),f);});
