import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {save,load} from '../src/documents.mjs';test('legacy save/load',()=>{const f=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'docs-')),'d');save(f,{text:'é',color:'red'});assert.deepEqual(load(f),{text:'é',color:'red'});});
