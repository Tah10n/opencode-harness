"""Single-instance wiring for the existing two-world Runner; no provider calls."""
import argparse, csv, io, json, sys, tarfile, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'development/polybench-pilot/two-world-diagnostic'))
import driver as d
ID = 'mui__material-ui-18141'
TEST = 'packages/material-ui/src/TextField/TextField.test.js'
DIAG = 'packages/material-ui/src/TextField/id-observation.test.js'

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('mode', choices=['calibrate','evaluate']); ap.add_argument('--out', required=True, type=Path); ap.add_argument('--patch', type=Path)
    a = ap.parse_args(); a.out.mkdir(parents=True, exist_ok=False)
    d.IDS = [ID]; task = d.inputs()[ID]; task['mui_plain_preparation'] = True
    runner = d.Runner(a.out); initial = d.guard(); started = time.monotonic()
    summary = {'mode': a.mode, 'provider_requests': 0, 'cases': [], 'driver_sha256': d.sha(Path(d.__file__).read_bytes()), 'diagnostic_sha256': d.sha((HERE/'id-observation.test.js').read_bytes())}
    try:
        with runner.container(task) as c:
            runner.baseline(c, task)
            versions = runner.cmd(c, ['bash','-c','. /usr/local/nvm/nvm.sh && nvm use 18.8.0 >/dev/null && node -v && npm -v']).output.decode().splitlines()
            assert versions == ['v18.8.0','8.18.0']; summary['toolchain'] = versions
            reporter = runner.cmd(c,['cat','/tmp/custom-reporter.js']).output
            tree, official = runner.apply(c,task['row']['test_patch'].encode())
            runner.put(c,'testbed/'+DIAG,(HERE/'id-observation.test.js').read_bytes())
            runner.cmd(c,['git','add','--',DIAG]); assessment_tree, source = runner.apply(c,b'')
            files = d.archive_entries(source)
            # Test-only helpers; production exports/modules remain F, including test-utils consumers.
            helpers = sorted(p for p in files if p.startswith('test/utils/'))
            # Public package test-utils include render/assertion helpers. Preserve their complete B bytes.
            helpers += sorted(p for p in files if p.startswith('packages/material-ui/src/test-utils/'))
            command = task['row']['test_command'].replace('/testbed/custom-reporter.js','/tmp/custom-reporter.js').replace('NODE_ENV=test', 'NODE_ENV=test NODE_PATH=/testbed/node_modules')
            m = {'instance_id':ID,'base_commit':task['base_commit'],'dataset_revision':'b3fca77b637379f0c01ad86d18753a7ac1998b53','evaluator':d.UPSTREAM,'image':task['officialImage'],
                 'official_test_patch_sha256':d.sha(task['row']['test_patch'].encode()),'official_assessment_tree':tree,'assessment_tree':assessment_tree,'assessment_inventory_sha256':d.sha(d.packed(files)),
                 'files':[TEST,DIAG,*helpers], 'directories':[], 'execution_overlay':{}, 'mutable_execution_paths':[],
                 'fixed_execution_inputs':['package.json','yarn.lock','babel.config.js','test/mocha.opts','.gitignore'],
                 'source_import_targets':['packages/material-ui/src/TextField/TextField.js','packages/material-ui/src/Select/Select.js','packages/material-ui/src/Select/SelectInput.js','packages/material-ui/src/NativeSelect/NativeSelectInput.js','packages/material-ui/src/InputBase/InputBase.js'],
                 'build_outputs':[], 'build_output_files':[], 'control_test':TEST,
                 'delivered_command':command, 'assessment_command':command.replace(TEST, TEST+' '+DIAG),
                 'reporter_sha256':d.sha(reporter), 'diagnostic_sha256':summary['diagnostic_sha256'],
                 'build_note':'Fresh Mocha process uses baseline Babel register + aliases to this /testbed source; no built production output is consumed.',
                 'scope':'F: full delivered TextField tests. E: unchanged official TextField F2P and 18 P2P plus separate literal ID observation. No platform matrix.'}
            summary['manifest_sha256'] = d.sha(d.packed(m))
            if a.mode == 'calibrate':
                d.save(HERE/'fe-manifest.json',m)
                variants=[('baseline',b''),('gold',task['row']['patch'].encode())]
            else:
                assert m == json.loads((HERE/'fe-manifest.json').read_bytes()), 'F/E surface changed'
                calibration=json.loads((ROOT/'local/plain-mui-18141/calibration-2/summary.json').read_bytes())
                assert calibration['calibration_passed'] and calibration['manifest_sha256']==summary['manifest_sha256'] and calibration['driver_sha256']==summary['driver_sha256']
                assert a.patch; variants=[('P',a.patch.read_bytes())]
            empty = io.BytesIO()
            with tarfile.open(fileobj=empty,mode='w'): pass
            for label, patch in variants:
                runner.cmd(c,['git','reset','--hard',task['base_commit']])
                full_tree,full=runner.apply(c,patch)
                result={'arm':label,'delivery_apply':True,'patch_sha256':d.sha(patch),'full_tree':full_tree}
                result['F']=runner.run(task,m,label+'-F',full,source,empty.getvalue(),'F')
                result['E']=runner.run(task,m,label+'-E',full,source,empty.getvalue(),'E')
                summary['cases'].append(result)
                if a.mode=='calibrate' and label=='gold':
                    runner.put(c,'testbed/'+TEST,b'// overlap control: author removed assertions\n')
                    runner.cmd(c,['git','add','--',TEST]); _, overlap=runner.apply(c,b'')
                    e=runner.run(task,m,'gold-overlap-E',overlap,source,empty.getvalue(),'E')
                    summary['cases'].append({'arm':'gold-overlap','E':e})
            if a.mode=='calibrate':
                base,gold,overlap=summary['cases']
                summary['calibration_passed'] = (all(x['E']['assessment_integrity']=='verified' for x in summary['cases']) and base['E']['failed']==2 and base['E']['passed']==18 and gold['E']['passed']==20 and gold['E']['failed']==0 and overlap['E']['passed']==20 and overlap['E']['failed']==0 and all(x['F']['delivered_checks']=='passed' for x in [base,gold]))
    finally:
        summary['seconds']=round(time.monotonic()-started,3); summary['created_containers']=runner.created; summary['removed_containers']=runner.removed; summary['historical_inputs_unchanged']=d.guard()==initial
        d.save(a.out/'summary.json',summary);runner.client.close()
    assert summary['historical_inputs_unchanged']
    if a.mode=='calibrate': assert summary['calibration_passed'], 'calibration failed; do not start author'
if __name__=='__main__': main()
