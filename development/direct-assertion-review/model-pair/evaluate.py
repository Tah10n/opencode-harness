"""Dispatch the frozen historical F/E procedure with new artifact paths only.

No probe, test interpretation, implementation, or historical evaluator is edited.
The unchanged preparation/functions and unchanged F/E body are executed separately
so this campaign checks its own freeze instead of the historical scheduler hash.
"""
import hashlib
import json
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
LOCAL=ROOT/'local/direct-assertion-review-model-pair'
DEV=ROOT/'development/direct-assertion-review/model-pair'
prior=ROOT/'development/plain-ledger-native-high/evaluate.py'
frozen=json.loads((LOCAL/'batch/freeze.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for p,h in frozen['files'].items():assert sha(Path(p))==h,p
assert (LOCAL/'batch/outcome.json').is_file(), 'No evaluation while author slots are active'
source=prior.read_text()
setup=source[:source.index('OUT.mkdir(mode=0o700)')]
procedure=source[source.index("F = OUT / 'F'"):]
for arm in ['AR0','AR1']:
    run=LOCAL/'batch/runs'/('account-switch-ledger-'+arm)
    if not (run/'model.patch').exists():continue
    namespace={'__file__':str(prior),'__name__':'frozen_pair_evaluator'}
    exec(compile(setup,str(prior),'exec'),namespace)
    out=LOCAL/('evaluation-'+arm);out.mkdir(mode=0o700)
    namespace.update(RUN=run,OUT=out,patch=run/'model.patch')
    start=time.monotonic();original_command=namespace['command']
    def measured(*args,**kwargs):
        started=time.monotonic();receipt=original_command(*args,**kwargs)
        receipt['durationMs']=round((time.monotonic()-started)*1000)
        return receipt
    namespace['command']=measured
    exec(compile(procedure,str(prior),'exec'),namespace)
    summary=namespace['summary']
    if summary['delivery_apply']:
        F,E=namespace['F'],namespace['E'];tree=namespace['tree'];before=tree(E)
        summary['supplemental']=[measured('E-'+name,namespace['docker'](E,True)+['node','/probes/'+name+'.mjs']) for name in ['diagnose','privacy-observation']]
        changed=namespace['subprocess'].check_output(['git','diff','--cached','--name-only','--diff-filter=AM'],cwd=F,text=True).splitlines()
        extra=[p for p in changed if p.startswith('packages/connector/test/') and p.endswith(('.test.mjs','.test.cjs','.test.js')) and p not in ['packages/connector/test/'+s+'.test.mjs' for s in ['readers','config','protocol']]]
        summary['additionalF']=[measured('F-additional-affected-tests',namespace['docker'](F)+['node','--test',*extra])] if extra else []
        assert tree(F)==tree(E)==before
        summary['frozenEvaluatorSha256']=sha(prior)
        summary['procedureUnchanged']=True
    summary['evaluationElapsedMs']=round((time.monotonic()-start)*1000)
    (out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(arm,json.dumps(summary.get('contractTests')))
