"""Bound my exact-head media and native RTC comparisons and restore my original app configuration.
Created with Codex.
"""
import json
import os
import time
import urllib.request
from pathlib import Path
SLUG='b8ab9abc_eufy_t8n00_test'
ROOT=Path('/tmp/eufy-review-074')
def call(path,body=None):
    req=urllib.request.Request('http://supervisor'+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+os.environ['SUPERVISOR_TOKEN'],'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=90) as response: result=json.load(response)
    if result.get('result')!='ok': raise RuntimeError('supervisor_request_failed')
    return result.get('data')
before=call('/addons/'+SLUG+'/info')
assert before['version']=='0.3.74' and before['state']=='started'
assert before['options']['qualification_profile']=='combined78'
report={'artifact':os.environ['QUALIFICATION_ARTIFACT'],'started':time.time(),'phases':[]}
def save(): ROOT.with_suffix('.json').write_text(json.dumps(report))
try:
    call('/addons/'+SLUG+'/options',{'watchdog':False})
    call('/addons/'+SLUG+'/stop',{})
    for profile in ['sdk685']:
        call('/addons/'+SLUG+'/options',{'options':dict(before['options'],qualification_profile=profile)})
        call('/addons/'+SLUG+'/start',{})
        report['phase']=profile
        phase={'profile':profile,'started':time.time()};report['phases'].append(phase);save()
        deadline=time.monotonic()+(190 if profile.startswith('sdk') else 500)
        done=Path(str(ROOT)+'.'+profile+'.done')
        while time.monotonic()<deadline and not done.exists():
            time.sleep(2)
            if profile.startswith('sdk') and call('/addons/'+SLUG+'/info')['state']!='started':
                phase['processEnded']=True
                break
        phase['signaled']=done.exists();phase['finished']=time.time();save()
        state=call('/addons/'+SLUG+'/info')['state']
        if state=='started':call('/addons/'+SLUG+'/stop',{})
        if not phase.get('processEnded') and not done.exists():raise RuntimeError('phase_timeout')
        time.sleep(10)
except Exception as error:report['errorType']=type(error).__name__
finally:
    try:
        if call('/addons/'+SLUG+'/info')['state']=='started':call('/addons/'+SLUG+'/stop',{})
        call('/addons/'+SLUG+'/options',{'options':before['options'],'boot':before['boot'],'watchdog':before['watchdog']})
        call('/addons/'+SLUG+'/start',{})
        after=call('/addons/'+SLUG+'/info')
        report['restored']=after['state']=='started' and after['options']['qualification_profile']=='combined78' and after['watchdog']==before['watchdog']
    except Exception as error:report['restoreErrorType']=type(error).__name__
    report['finished']=time.time();save()
