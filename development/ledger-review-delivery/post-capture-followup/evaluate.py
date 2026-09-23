"""Reuse the frozen evaluator verbatim except output root and freeze provenance.
No acceptance, parser, probe, assertion or expected behavior is modified.
"""
import hashlib
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[3]
dev = root / 'development/ledger-review-delivery'
followup = dev / 'post-capture-followup'
original = json.loads((dev / 'manifest.json').read_text())
for name, digest in original['files'].items():
    historical = subprocess.check_output(['git', 'show', '51f10ba2:' + name], cwd=root)
    assert hashlib.sha256(historical).hexdigest() == digest, name
frozen = json.loads((followup / 'manifest.json').read_text())
for name, digest in frozen['files'].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
source = (dev / 'evaluate.py').read_text()
source = source.replace("OUT = LOCAL / ('evaluation-' + label)",
                        "OUT = LOCAL / 'post-capture-followup' / ('evaluation-' + label)")
source = source.replace("for p, expected in manifest['files'].items():\n    assert sha(ROOT / p) == expected, p", '')
exec(compile(source, str(dev / 'evaluate.py'), 'exec'),
     {'__file__': str(dev / 'evaluate.py'), '__name__': '__main__'})
