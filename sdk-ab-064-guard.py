"""Bounded SDK comparison with original app restoration. Created with Codex."""
import json
import os
import time
import urllib.request
from pathlib import Path

STABLE = 'b0e7d1ed_eufy_sdk_bridge'
TEST = 'b8ab9abc_eufy_t8n00_test'
ROOT = Path('/tmp/eufy-sdk-ab-064')


def request(path, body=None):
    req = urllib.request.Request('http://supervisor' + path,
        data=None if body is None else json.dumps(body).encode(), headers={
        'Authorization': 'Bearer ' + os.environ['SUPERVISOR_TOKEN'],
        'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90) as response:
        result = json.load(response)
    if result.get('result') != 'ok':
        raise RuntimeError('Supervisor request failed')
    return result.get('data')


stable = request('/addons/' + STABLE + '/info')
test = request('/addons/' + TEST + '/info')
assert stable['state'] == 'started' and test['state'] == 'stopped'
assert test['version'] == '0.3.64'
report = {'artifact': 'b3819194e9d64f77470bc09ae143e9468d53152c',
          'bridge': '8b6d485b926b0207eb6e209cfa1a477f697eb6d4',
          'started': time.time(), 'phases': []}


def save():
    ROOT.with_suffix('.json').write_text(json.dumps(report))


try:
    request('/addons/' + STABLE + '/options', {'watchdog': False})
    request('/addons/' + STABLE + '/stop', {})
    for sdk in ['beta35', 'beta63']:
        options = dict(test['options'])
        options['qualification_sdk'] = sdk
        request('/addons/' + TEST + '/options', {'options': options, 'watchdog': False, 'boot': 'manual'})
        request('/addons/' + TEST + '/start', {})
        report['phase'] = sdk
        report['phases'].append({'sdk': sdk, 'started': time.time()})
        save()
        deadline = time.monotonic() + 720
        done = Path(str(ROOT) + '.' + sdk + '.done')
        while time.monotonic() < deadline and not done.exists():
            time.sleep(2)
        report['phases'][-1]['completionSignal'] = done.exists()
        save()
        request('/addons/' + TEST + '/stop', {})
        if not done.exists():
            raise RuntimeError('phase timeout')
    report['phase'] = 'finished'
except Exception as error:
    report['errorType'] = type(error).__name__
finally:
    try:
        if request('/addons/' + TEST + '/info')['state'] == 'started':
            request('/addons/' + TEST + '/stop', {})
        request('/addons/' + TEST + '/options', {'options': test['options'], 'watchdog': test['watchdog'], 'boot': test['boot']})
        if request('/addons/' + STABLE + '/info')['state'] != 'started':
            request('/addons/' + STABLE + '/start', {})
        request('/addons/' + STABLE + '/options', {'watchdog': stable['watchdog'], 'boot': stable['boot']})
        report['stableRestored'] = request('/addons/' + STABLE + '/info')['state'] == 'started'
    except Exception as error:
        report['restoreErrorType'] = type(error).__name__
    report['finished'] = time.time()
    save()
