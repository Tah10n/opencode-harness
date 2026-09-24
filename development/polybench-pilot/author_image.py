"""Create a source-free author base without changing the benchmark toolchain."""
import argparse,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];LOCAL=ROOT/'local/polybench-pilot'
p=argparse.ArgumentParser();p.add_argument('instance_id');a=p.parse_args()
row=next(r for r in json.loads((ROOT/'development/polybench-pilot/selection.json').read_text())['selected'] if r['instance_id']==a.instance_id)
image=json.loads((LOCAL/'images.json').read_text())['polybench_'+row['language'].lower()+'_'+a.instance_id.lower()]
context=LOCAL/'diagnostic';dockerfile=context/(a.instance_id+'.Dockerfile')
# Only preparation material in the original image is removed. The author gets
# the independently archived original source and dependencies via /input.
dockerfile.write_text('FROM '+image['digest']+'\nCOPY lib/aarch64-linux-gnu/ /lib/aarch64-linux-gnu/\nCOPY usr/local/bin/node /diagnostic/node\nRUN ln -s /lib/aarch64-linux-gnu/ld-linux-aarch64.so.1 /lib/ld-linux-aarch64.so.1 && rm -rf /testbed /root/.npm /root/.cache /usr/local/nvm/.git /usr/local/share/.cache/yarn/v6/.tmp && mkdir /testbed && chmod 755 /testbed\nWORKDIR /\n')
tag='opencode-polybench-pilot-author-'+a.instance_id.lower()
with (LOCAL/(a.instance_id+'-author-build.log')).open('x') as log:
 subprocess.run(['docker','build','--platform','linux/amd64','--network','none','--pull=false','--provenance=false','-f',dockerfile,'-t',tag,context],check=True,stdout=log,stderr=subprocess.STDOUT)
inspect=json.loads(subprocess.check_output(['docker','image','inspect',tag]))[0]
record={'instance_id':a.instance_id,'official':image,'author_image':inspect['Id'],'dockerfile':dockerfile.read_text(),'toolchain_unchanged':True,'runtime_node':'/diagnostic/node'}
(LOCAL/'author-inputs'/a.instance_id/'image.json').write_text(json.dumps(record,indent=2))
print(json.dumps({'instance_id':a.instance_id,'author_image':inspect['Id']}))
