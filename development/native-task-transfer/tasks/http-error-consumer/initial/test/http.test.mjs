import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {findUser} from '../src/users.mjs';test('legacy JSON user',async()=>{assert.deepEqual(await findUser(async url=>({status:200,json:async()=>({url})}),'https://local','a'),{url:'https://local/users/a'});});
