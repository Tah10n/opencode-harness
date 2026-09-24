"""Verify toolchain startup, then append only public environment facts to tasks."""
import csv,json,re,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot'
csv.field_size_limit(10000000)
with (LOCAL/'selected.csv').open(newline='') as f:rows=list(csv.DictReader(f))
p=LOCAL/'environments.json';environments=json.loads(p.read_text()) if p.exists() else {}
for row in rows:
 id=row['instance_id'];folder=LOCAL/'author-inputs'/id
 if not (folder/'image.json').exists():continue
 source=folder/'source'
 if str(source) in environments:continue
 audit=json.loads((folder/'audit.json').read_text());image=json.loads((folder/'image.json').read_text())['author_image']
 # Only startup version is extracted; hidden test names/commands never enter prompt.
 versions=re.findall(r'nvm use\s+([0-9.]+)',row['test_command'])
 startup=('. /usr/local/nvm/nvm.sh && '+('nvm use '+versions[0]+' >/dev/null && ' if versions else '')) if 'nvm.sh' in row['test_command'] else ''
 probe=startup+"printf 'NODE='; node --version; printf 'NPM='; npm --version; printf 'PATH='; printf '%s\\n' \"$PATH\""
 args=['docker','run','--rm','--platform','linux/amd64','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','512m','--pids-limit','128','--tmpfs','/tmp:rw,nosuid,size=64m','--env','HOME=/tmp',image,'bash','-c','set -e; '+probe]
 result=subprocess.run(args,capture_output=True,text=True,check=True)
 (folder/'toolchain-probe.json').write_text(json.dumps({'command':args,'stdout':result.stdout,'stderr':result.stderr,'exit':result.returncode},indent=2))
 facts=dict(line.split('=',1) for line in result.stdout.splitlines() if line.startswith(('NODE=','NPM=','PATH=')))
 if set(facts)!={'NODE','NPM','PATH'}:raise RuntimeError('Toolchain output incomplete')
 environment='\n\nEnvironment (identical for P/H0/H1):\nExternal network is unavailable to tools. Project dependencies are prepared. The project uses Node '+facts['NODE'].removeprefix('v')+' and npm '+facts['NPM']+'. Use the original package.json scripts and public project tests/docs. Diagnostic tooling is separate from the project toolchain.\n'
 if versions:environment+='For the project shell, the prepared startup is `. /usr/local/nvm/nvm.sh && nvm use '+versions[0]+'`.\n'
 task=row['problem_statement']+environment
 existing=source/'TASK.md'
 if existing.exists() and existing.read_bytes().decode('utf-8')!=task:raise RuntimeError('Existing task prompt differs; inspect before updating '+id)
 existing.write_text(task)
 environment={'image':image,'node':'/diagnostic/node','projectPath':facts['PATH'],'projectNode':facts['NODE'],'npm':facts['NPM'],'dependencyDirectories':audit['dependency_directories'],'startup':startup}
 environments[str(source)]=environment
 p.write_text(json.dumps(environments,indent=2))
 print(id+' startup verified '+facts['NODE'],flush=True)
