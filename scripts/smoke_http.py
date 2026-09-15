#!/usr/bin/env python3
"""Exercise the real server with disposable saves, including restart/resume."""
import json
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BIN = ROOT / 'target/debug/heavy-earth'

def launch(directory):
    p = subprocess.Popen([str(BIN), '--port', '0', '--saves', directory], stdout=subprocess.PIPE, text=True)
    for _ in range(5):
        line = p.stdout.readline().strip()
        if line.startswith('Play: '):
            return p, line[6:]
    p.terminate()
    raise RuntimeError('Server did not start')

def request(base, route, body=None, headers=None):
    h = {'Content-Type': 'application/json', 'X-Heavy-Earth': '1'}
    if headers: h.update(headers)
    req = urllib.request.Request(base + route, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data=r.read()
            return r.status, json.loads(data) if r.headers.get_content_type()=='application/json' else data
    except urllib.error.HTTPError as e:
        return e.code, e.read()

with tempfile.TemporaryDirectory(prefix='heavy-earth-http-') as directory:
    proc,base=launch(directory)
    try:
        assert request(base,'/api/state')[1]['phase']=='Title'
        for route in ['/', '/app.js','/renderer.js','/panels.js','/style.css','/brand.png','/grid.js','/panel-grid.svg','/panel-template.pdf']:
            assert request(base,route)[0]==200, route
        assert request(base,'/api/roll',{'name':'Smoke','class':'cleric','dungeon':'telengard'})[0]==200
        status,state=request(base,'/api/begin',{})
        assert status==200 and state['phase']=='Town'
        save_id=state['saveId']; rev=state['revision']
        assert request(base,'/api/command',{'command':'enter','revision':rev},{'Origin':'https://example.com'})[0]==403
        assert request(base,'/api/state',headers={'Host':'attacker.invalid'})[0]==403
        status,state=request(base,'/api/command',{'command':'enter','revision':rev})
        assert status==200 and state['phase']=='Exploring' and state['map']['rooms']
        assert request(base,'/api/command',{'command':'east','revision':rev})[0]==400
        assert request(base,'/api/map?level=0')[0]==400
        assert request(base,'/api/map?level=21')[0]==400
        assert request(base,'/api/map?level=2')[1]['rooms']==[]
        assert request(base,'/api/resume',{'id':'../../escape'})[0]==400
        assert request(base,'/api/saves')[1][0]['name']=='Smoke'
        snapshot=state
    finally:
        proc.terminate();proc.wait(timeout=5)
    proc,base=launch(directory)
    try:
        status,resumed=request(base,'/api/resume',{'id':save_id})
        assert status==200
        for key in ['player','position','phase','map','log','turns']:
            assert resumed[key]==snapshot[key], key
    finally:
        proc.terminate();proc.wait(timeout=5)
print('HTTP smoke passed: assets, creation, actions, stale tabs, local-origin checks, journals, and restart/resume.')
