"""One explicit application-only reproduction; existing output is never overwritten."""
import argparse
from pathlib import Path
import subprocess
import sys
from summarize import summarize

p = argparse.ArgumentParser()
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=False)
here = Path(__file__).resolve().parent
subprocess.run([sys.executable, str(here / 'diagnose.py'), '--out', str(a.out / 'raw')], check=True)
subprocess.run([sys.executable, str(here / 'controls.py'), '--out', str(a.out / 'controls.json')], check=True)
summarize(a.out / 'raw', a.out / 'evidence')
print('Nine application cases and five controls completed. No tests or scoring ran.')
