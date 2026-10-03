"""Offline consistency check for this stopped campaign; no provider or runtime run."""
import hashlib
import json
from pathlib import Path
import subprocess

here = Path(__file__).resolve().parent
repository = here.parents[3]
result = json.loads((here / 'results.json').read_text())
seal = json.loads((here.parent / 'execution-freeze.json').read_text())
scoring = json.loads((here / 'independent-evaluation.json').read_text())
delivery = json.loads((here / 'delivery-evidence.json').read_text())
cleanup = json.loads((here / 'cleanup-evidence.json').read_text())
sha = lambda value: hashlib.sha256(value).hexdigest()

assert result['verifiedSourceCommit'] == seal['sourceCommit']
assert result['freezeSha256'] == seal['freezeSha256']
assert result['executionImage'] == seal['executionImage']
assert result['configuredModel'] == 'openai/gpt-5.6-luna'
assert result['configuredVariant'] == 'high'
assert result['budgetMs'] == 600000
assert result['executionEnvironment']['nodeVersion'] == '24.19.0'
assert result['executionEnvironment']['runtimeVersion'] == '1.18.26'
assert len(result['rows']) == 16
assert [{k: row[k] for k in ['slot', 'task', 'arm']} for row in result['rows']] == seal['order']
assert result['counts'] == {
    'scheduled': 16, 'nativeAttemptsStarted': 1, 'nativeNormallyCompleted': 0,
    'locallyTerminatedAndCaptured': 1, 'notStarted': 15,
    'realProviderRequests': 0, 'relayFrames': 7, 'authorStagesStarted': 0,
    'DNativeCorrections': 0,
}
first, *remaining = result['rows']
assert first['status'] == 'technical_stop'
assert first['R'] is False and first['delivery'] is False and first['Q'] is False
assert first['internalStatus'] is None and first['corrections'] is None
assert first['nativeCompletion'] is False and first['authorStagesStarted'] == 0
assert all(row['status'] == 'not_started' for row in remaining)
assert all(row[key] is None for row in remaining for key in ['R', 'delivery', 'Q'])
assert all(row['providerRequestsObserved'] == 0 for row in result['rows'])
assert all(row['modelBackedOutcome'] is None for row in result['rows'])
assert result['comparison']['unknownPairs'] == 8
assert result['comparison']['deltaQPercentagePoints'] is None
assert all(result['comparison'][key] == 0 for key in ['candidateWins', 'candidateLosses', 'ties'])
assert len(result['actualRequestModels']) == 7
assert result['actualRequestModels'][0] == {
    'kind': 'title', 'model': 'gpt-5.6-luna', 'reasoningEffort': 'none', 'forwarded': False,
}
assert all(r == {'kind': 'work', 'model': 'gpt-5.6-luna', 'reasoningEffort': 'high', 'forwarded': False}
           for r in result['actualRequestModels'][1:])
assert result['providerReturnedModels'] == []
assert result['pause'] == {'kind': 'boundary_refusal', 'slot': 1}
assert delivery['runtime']['nativeCompleted'] is False
assert delivery['runtime']['toolCalls'] == 0
assert delivery['capture']['roundtripVerified'] is True
assert delivery['capture']['hasArtifacts'] is False
assert all(delivery['stop'][key] is True for key in ['terminationVerified', 'captureSaved', 'relayRemoved', 'forwardingClosed'])
assert delivery['stop']['activeProviderHandlers'] == 0
assert delivery['stop']['providerServerStateMayRemainUnknown'] is False
assert len(delivery['providerFrames']) == 7
assert all(frame['forwarded'] is False for frame in delivery['providerFrames'])
assert delivery['providerFrames'][0]['rejected'] is True
assert all(frame['notForwardedReason'] == 'series-paused' for frame in delivery['providerFrames'][1:])
patch = (here / first['patchFile']).read_bytes()
assert patch == b'' and scoring['patchSha256'] == sha(patch)
assert delivery['patchSha256'] == sha(patch)
assert scoring['R'] is False and scoring['patchApplied'] is True
assert scoring['contained'] is True and scoring['cleanupVerified'] is True
assert result['unchangedConditionsAfterAdmission'] is True
assert result['executableAdapterMutationsAfterAdmission'] == result['additionalRealAttempts'] == 0
assert cleanup['filesystem']['allTargetsAbsent'] is True
assert cleanup['filesystem']['archiveHashesReverifiedBeforeDeletion'] is True
assert cleanup['filesystem']['admissionAndPauseRetained'] is True
assert cleanup['docker']['recordedAttemptAndEvaluationContainers'] == 70
assert cleanup['docker']['recordedContainersRemaining'] == []
assert all(cleanup['docker'][key] is True for key in ['builderRemoved', 'builderVolumeRemoved', 'executionImageRemoved'])
assert cleanup['archives']['executionImageReloadVerified'] is True
assert cleanup['archives']['assetsRoundtripVerified'] is True
assert cleanup['archives']['private-evidence.tar.gz']['allMemberBytesAndModesVerified'] is True
assert cleanup['globalPrunePerformed'] is False and cleanup['foreignResourcesTouched'] is False

# Bind current executable/task bytes to the exact pre-run source commit.
source = result['verifiedSourceCommit']
plan = json.loads(subprocess.check_output([
    'git', 'show', source + ':evaluation/feedback-development/frozen-manifest.json'
], cwd=repository))
for name, entry in {**plan['files'], **plan['product']}.items():
    if 'sha256' not in entry:
        continue
    committed = subprocess.check_output(['git', 'show', source + ':' + name], cwd=repository)
    assert sha(committed) == entry['sha256'] == sha((repository / name).read_bytes()), name
print('PASS 16 exact slots, pre-provider stop, no model outcomes/retries, immutable source, full patch and independent score')
