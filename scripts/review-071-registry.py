"""Observe recovery of one idle registration through the internal API. Created with Codex."""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
import yaml

BASE = 'http://b8ab9abc-eufy-t8n00-test:1984/api/'
report = {'source': 'f00bcf74c0f3736e38841a69796afbe06f99688e', 'started': time.time()}

def request(endpoint, method='GET'):
    with urllib.request.urlopen(urllib.request.Request(BASE + endpoint, method=method), timeout=5) as response:
        return response.read()

def streams():
    return json.loads(request('streams'))

name = None
removed = False
try:
    config = yaml.safe_load(request('config'))
    live = streams()
    name = next(n for n in live if n.endswith('_view_1') and not live[n].get('consumers'))
    sources = config['streams'][name]
    assert isinstance(sources, list) and all(isinstance(s, str) for s in sources)
    request('streams?' + urllib.parse.urlencode({'src': name}), 'DELETE')
    removed = True
    report['confirmedMissing'] = name not in streams()
    assert report['confirmedMissing']
    start = time.monotonic()
    while time.monotonic() - start < 45:
        time.sleep(1)
        if name in streams():
            report['recoveredAfterMs'] = round((time.monotonic() - start) * 1000)
            report['status'] = 'recovered'
            break
    report.setdefault('status', 'recovery_timeout')
except Exception as error:
    report['status'] = 'failed'
    report['errorType'] = type(error).__name__
finally:
    if removed and name not in streams():
        params = [('name', name)] + [('src', source) for source in sources]
        request('streams?' + urllib.parse.urlencode(params), 'PUT')
        report['emergencyRestore'] = name in streams()
    report['finished'] = time.time()
    Path('/tmp/eufy-review-071-registry.json').write_text(json.dumps(report))
    print(json.dumps(report), flush=True)
