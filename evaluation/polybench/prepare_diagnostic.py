"""Reuse the existing pinned Node image, never replace the project toolchain."""
import subprocess,tarfile,shutil,json
from pathlib import Path
from campaign import LOCAL as CAMPAIGN_LOCAL, SELECTION, CONFIG
ROOT=Path(__file__).resolve().parents[2];folder=CAMPAIGN_LOCAL/'diagnostic';folder.mkdir(parents=True,exist_ok=True)
subprocess.run(['docker','build','--platform','linux/arm64','--iidfile',folder/'image-id','-f',ROOT/'evaluation/support/Dockerfile',ROOT/'evaluation/support'],check=True)
image=(folder/'image-id').read_text().strip()
files=['/usr/local/bin/node','/usr/bin/rg','/lib/aarch64-linux-gnu/libpcre2-8.so.0']+['/lib/aarch64-linux-gnu/'+f for f in ['libdl.so.2','libstdc++.so.6','libm.so.6','libgcc_s.so.1','libpthread.so.0','libc.so.6','ld-linux-aarch64.so.1']]
archive=folder/'runtime.tar'
if not archive.exists():
 with archive.open('xb') as out:
  subprocess.run(['docker','run','--pull=never','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--pids-limit','64',image,'tar','-chf','-',*files],check=True,stdout=out)
 with tarfile.open(archive) as tar:tar.extractall(folder,filter='data')
for file in files:
 if not (folder/file.lstrip('/')).is_file():raise RuntimeError('Incomplete diagnostic preparation')
(folder/'.dockerignore').write_text('runtime.tar\n')

runtime=json.loads((CAMPAIGN_LOCAL/'runtime.json').read_text())
for directory in runtime.get('bundleDirectories', ['bundle','core-bundle','plain-dependencies'] if CONFIG else ['bundle','plain-dependencies']):
 shutil.copy2(folder/'usr/bin/rg',CAMPAIGN_LOCAL/directory/'rg')
