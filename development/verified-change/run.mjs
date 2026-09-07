// Explicit development launcher. Never retries a completed or ambiguous attempt.
// Runtime artifacts and patches remain private outside the repository.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const [installedCli, ...requested] = process.argv.slice(2);
if (!installedCli || !path.isAbsolute(installedCli) || !requested.length) throw Error('Usage: node development/verified-change/run.mjs /absolute/installed/opencode-harness case...');
const materializer = fileURLToPath(new URL('./materialize.mjs', import.meta.url));
const listed = spawnSync(process.execPath, [materializer, '--list'], { encoding: 'utf8' });
if (listed.status !== 0) throw Error(listed.stderr);
const known = JSON.parse(listed.stdout);
const cases = requested.length === 1 && requested[0] === '--all' ? known : requested;
if (new Set(cases).size !== cases.length || cases.some(name => !known.includes(name))) throw Error('Unknown or repeated development case');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verified-change-development-campaign-'));
fs.chmodSync(root, 0o700);
fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify({ purpose:'development-only', installedCli, cases, model:'openai/gpt-5.6-luna', variant:'low', timeLimitMs:900000, retry:'none' }, null, 2), { mode:0o600, flag:'wx' });
console.log(JSON.stringify({ campaign:root, cases }));
for (const name of cases) {
  const prepared = spawnSync(process.execPath, [materializer, name], { encoding:'utf8' });
  if (prepared.status !== 0) throw Error(prepared.stderr);
  const repo = JSON.parse(prepared.stdout);
  const directory = path.join(root,name); fs.mkdirSync(directory,{mode:0o700});
  fs.writeFileSync(path.join(directory,'started.json'), JSON.stringify({at:new Date().toISOString(), ...repo}), {flag:'wx',mode:0o600});
  console.log(JSON.stringify({ started:name, repository:repo.repository }));
  const out = fs.openSync(path.join(directory,'stdout.json'),'wx',0o600);
  const err = fs.openSync(path.join(directory,'stderr.txt'),'wx',0o600);
  const started = Date.now();
  // The CLI owns timeout/cancellation and cleanup. Do not kill or resubmit from
  // an observer timeout. No outer spawnSync timeout is used.
  const result = spawnSync(installedCli,['run','--workspace',repo.repository,'--model','openai/gpt-5.6-luna','--variant','low','--time-limit-ms','900000','--',fs.readFileSync(repo.taskFile,'utf8')], {stdio:['ignore',out,err]});
  fs.closeSync(out); fs.closeSync(err);
  let report;
  try { report=JSON.parse(fs.readFileSync(path.join(directory,'stdout.json'),'utf8')); } catch { report={stopReason:'unreadable_report'}; }
  const summary={case:name,exitCode:result.status,signal:result.signal,error:result.error?.message,elapsedMs:Date.now()-started,stopReason:report.stopReason,repairs:report.repairs,selected:report.selected?.name,applied:report.application?.applied,confirmed:report.confirmed?.map(c=>c.id),unverified:report.unverified?.map(c=>({id:c.id,reason:c.reason})),artifacts:report.output,directory};
  fs.writeFileSync(path.join(directory,'finished.json'),JSON.stringify(summary,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(summary));
  // Uncertain submission is terminal for this case. Continuing to a different
  // predeclared case never retries the interrupted request.
}
