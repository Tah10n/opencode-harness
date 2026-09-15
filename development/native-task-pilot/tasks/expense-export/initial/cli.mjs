import fs from 'node:fs'; import {parseArgs} from './src/args.mjs'; import {buildReport} from './src/report.mjs'; import {renderCsv} from './src/csv.mjs';
try { const options=parseArgs(process.argv.slice(2)); process.stdout.write(renderCsv(buildReport(JSON.parse(fs.readFileSync(options.file,'utf8'))))); } catch(error) { process.stderr.write(error.message+'\n'); process.exitCode=2; }
