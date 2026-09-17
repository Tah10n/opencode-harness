"""Reuse the existing pinned Node image, never replace the project toolchain."""
import subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];folder=ROOT/'local/polybench-pilot/diagnostic';folder.mkdir(parents=True,exist_ok=True)
image='sha256:0ed6cee0b095ecf1e1e780418cb373d462f1b99643bb86db0a8de7dd58fc83a6'
files=['/usr/local/bin/node']+['/lib/aarch64-linux-gnu/'+f for f in ['libdl.so.2','libstdc++.so.6','libm.so.6','libgcc_s.so.1','libpthread.so.0','libc.so.6','ld-linux-aarch64.so.1']]
archive=folder/'runtime.tar'
if not archive.exists():
 with archive.open('xb') as out:
  subprocess.run(['docker','run','--pull=never','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','256m','--pids-limit','64',image,'tar','-chf','-',*files],check=True,stdout=out)
 with tarfile.open(archive) as tar:tar.extractall(folder,filter='data')
for file in files:
 if not (folder/file.lstrip('/')).is_file():raise RuntimeError('Incomplete diagnostic preparation')
(folder/'.dockerignore').write_text('runtime.tar\n')
