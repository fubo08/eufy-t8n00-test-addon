"""Bounded app switch with automatic restoration. Created with Codex."""
import json
import os
import time
import urllib.request
from pathlib import Path

STABLE = 'b0e7d1ed_eufy_sdk_bridge'
TEST = 'b8ab9abc_eufy_t8n00_test'
ROOT = Path('/tmp/eufy-h264-063')

def request(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request('http://supervisor' + path, data=data, headers={
        'Authorization': 'Bearer ' + os.environ['SUPERVISOR_TOKEN'],
        'Content-Type': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=90) as response:
        result = json.load(response)
    if result.get('result') != 'ok':
        raise RuntimeError('Supervisor request failed')
    return result.get('data')

stable = request('/addons/' + STABLE + '/info')
test = request('/addons/' + TEST + '/info')
assert stable['state'] == 'started' and test['state'] == 'stopped'
assert test['version'] == '0.3.63'
report = {'artifact': '9b18fed67ceaff190769e63946a676e39d5060aa',
          'bridge': 'f0c61df2d022148d6e8edb29083ee3cb085b9593',
          'sdk': '0.5.0', 'started': time.time()}

def save():
    ROOT.with_suffix('.json').write_text(json.dumps(report))

try:
    request('/addons/' + STABLE + '/options', {'watchdog': False})
    request('/addons/' + STABLE + '/stop', {})
    options = dict(test['options'])
    options['qualify_profile_probe'] = False
    options['transcode_h264'] = os.environ['EUFY_TEST_TRANSCODE'].split(',')
    options['transcode_width'] = 1920
    request('/addons/' + TEST + '/options', {'options': options, 'watchdog': False, 'boot': 'manual'})
    request('/addons/' + TEST + '/start', {})
    report['testStarted'] = True
    save()
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline and not ROOT.with_suffix('.done').exists():
        time.sleep(2)
    report['completionSignal'] = ROOT.with_suffix('.done').exists()
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
