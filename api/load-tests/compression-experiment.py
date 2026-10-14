"""Temporary development-only compression override; no JAR replacement."""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request

UNIT='todiscount-be-dev'
CONF=Path('/etc/systemd/system/todiscount-be-dev.service.d/load-test-compression.conf')
CONFIG='[Service]\nEnvironment=SERVER_COMPRESSION_ENABLED=true\nEnvironment=SERVER_COMPRESSION_MIME_TYPES=application/json\nEnvironment=SERVER_COMPRESSION_MIN_RESPONSE_SIZE=2KB\n'

def request(encoding):
    req=urllib.request.Request('http://127.0.0.1:8080/api/brands',headers={'Accept-Encoding':encoding})
    with urllib.request.urlopen(req,timeout=5) as r:
        body=r.read();encoded=r.headers.get('Content-Encoding')
        decoded=gzip.decompress(body) if encoded=='gzip' else body
        return {'encoding':encoded,'wire_bytes':len(body),'json':json.loads(decoded),
                'sha256':hashlib.sha256(decoded).hexdigest()}

def restart():
    subprocess.run(['systemctl','daemon-reload'],check=True)
    subprocess.run(['systemctl','restart',UNIT],check=True)
    for _ in range(30):
        try:request('identity');return
        except Exception:time.sleep(2)
    raise RuntimeError('Development API did not recover')

def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['apply','revert']);args=p.parse_args()
    if os.geteuid()!=0:raise SystemExit('Run with sudo on the development host')
    if not Path('/etc/systemd/system/todiscount-be-dev.service').exists():raise SystemExit('Development unit missing')
    if args.action=='revert':
        if CONF.read_text()!=CONFIG:raise SystemExit('Refusing to remove an unrelated configuration')
        CONF.unlink();restart();print('Development compression override reverted');return
    if CONF.exists():raise SystemExit('Experiment override already exists')
    before=request('identity')
    try:
        CONF.write_text(CONFIG);CONF.chmod(0o644);restart()
        after=request('gzip');plain=request('identity')
        assert after['encoding']=='gzip',after['encoding']
        assert before['json']==after['json']==plain['json'],'Response content changed'
        assert plain['encoding'] is None,'Identity request was compressed'
        print(json.dumps({'before_bytes':before['wire_bytes'],'after_bytes':after['wire_bytes'],
                          'decoded_sha256':after['sha256'],'json_identical':True}))
    except BaseException:
        CONF.unlink(missing_ok=True);restart();raise

if __name__=='__main__':main()
