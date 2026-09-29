"""Fail before imports if the pinned evaluator contains modified or extra sources."""
import subprocess, sys
from pathlib import Path
SHA = '9c836c5d7f3cb991934132b77d29e6941d912a07'
def verify(evaluator):
    if sys.flags.optimize:
        raise RuntimeError('Evaluator checks require Python assertions enabled')
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=evaluator, text=True).strip()
    if git('rev-parse', 'HEAD') != SHA or git('diff', 'HEAD', '--'):
        raise RuntimeError('Evaluator differs from pinned revision')
    # Include ignored source files too. Bytecode caches are harmless only when
    # paired with tracked source, so remove/keep caches outside this checkout.
    extras = git('ls-files', '--others')
    if extras:
        raise RuntimeError('Unexpected evaluator files: ' + extras)
    if any(p.is_symlink() for p in Path(evaluator).rglob('*.py')):
        raise RuntimeError('Unexpected evaluator source symlink')
