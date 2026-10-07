import fs from 'node:fs';import {importRecords} from '../src/index.mjs';
try { const [file]=process.argv.slice(2);if(!file)throw Error('file required');console.log(JSON.stringify(await importRecords(fs.readFileSync(file,'utf8')))); }
catch(error) { console.error(error.message);process.exitCode=1; }
