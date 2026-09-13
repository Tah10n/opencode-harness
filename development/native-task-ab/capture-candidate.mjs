// Retain source, Git/task artifacts and patch bytes; frozen dependencies remain
// in the input manifest, not in an untrusted delivery archive. The strict
// path/link/size extractor is unchanged from the existing template runner.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function captureCandidate(session,directory) {
  const archive=path.join(directory,'candidate.tar');
  const output=fs.openSync(archive,'wx',0o600);
  const run=spawnSync('docker',['exec',session.name,'tar','--exclude=node_modules','-C','/work/repo','-cf','-','.'],{stdio:['ignore',output,'pipe'],timeout:30000});
  fs.closeSync(output);
  fs.writeFileSync(path.join(directory,'capture.json'),JSON.stringify({status:run.status,error:run.error?.message,stderr:run.stderr?.toString()},null,2));
  if(run.status!==0)return {status:run.status};
  const extracted=spawnSync('python3',[fileURLToPath(new URL('./extract-candidate.py',import.meta.url)),archive,path.join(directory,'candidate')],{encoding:'utf8',timeout:30000});
  fs.writeFileSync(path.join(directory,'extraction.json'),JSON.stringify({status:extracted.status,stderr:extracted.stderr,error:extracted.error?.message},null,2));
  return {status:extracted.status};
}
