"""Optional campaign paths for the existing adapter; historical defaults preserved."""
import json, os
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
CONFIG_PATH = Path(os.environ['POLYBENCH_CAMPAIGN']).resolve() if os.environ.get('POLYBENCH_CAMPAIGN') else None
CONFIG = json.loads(CONFIG_PATH.read_text()) if CONFIG_PATH else None
LOCAL = ROOT / (CONFIG['local_directory'] if CONFIG else 'local/polybench')
if CONFIG and CONFIG.get('selection_file', 'selection.json') not in ('selection.json', 'prepared-selection.json'):
    raise ValueError('Invalid stage selection path')
SELECTION = CONFIG_PATH.parent / CONFIG.get('selection_file', 'selection.json') if CONFIG_PATH else Path(__file__).with_name('selection.json')
if CONFIG and (not LOCAL.resolve().is_relative_to(ROOT / 'local') or LOCAL.resolve() == ROOT / 'local/polybench'):
    raise ValueError('New campaigns require a distinct private local directory')
ARMS = CONFIG['arms'] if CONFIG else ['P', 'H0', 'H1']
