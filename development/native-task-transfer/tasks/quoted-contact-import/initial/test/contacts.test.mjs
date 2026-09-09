import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {importContacts} from '../src/contacts.mjs';test('legacy simple import',()=>{assert.deepEqual(importContacts('name,email\nAda,a@x'),[{name:'Ada',email:'a@x'}]);});
