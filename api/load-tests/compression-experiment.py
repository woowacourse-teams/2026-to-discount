"""Temporary development-only compression override; no JAR replacement."""
import argparse
import gzip
import hashlib
import json
import os
import shlex
from pathlib import Path
import subprocess
import time
import urllib.request

UNIT='todiscount-be-dev'
CONFIG='[Service]\nEnvironment=SERVER_COMPRESSION_ENABLED=true\nEnvironment=SERVER_COMPRESSION_MIME_TYPES=application/json\nEnvironment=SERVER_COMPRESSION_MIN_RESPONSE_SIZE=2KB\n'

def server_paths(*names):
    """Read explicit process settings or administrator-managed systemd Environment."""
    settings = {}
    if any(not os.environ.get(name) for name in names):
        try:
            output = subprocess.check_output(
                ['systemctl', 'show', 'todiscount-be-dev', '-p', 'Environment', '--value'],
                text=True, stderr=subprocess.DEVNULL)
            settings = dict(item.split('=', 1) for item in shlex.split(output) if '=' in item)
        except (OSError, ValueError, subprocess.CalledProcessError):
            raise SystemExit('Development path settings unavailable') from None
    paths = {}
    for name in names:
        value = os.environ.get(name) or settings.get(name, '')
        if not value or not Path(value).is_absolute() or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise SystemExit('Missing or invalid development path setting: ' + name)
        paths[name] = Path(value)
    return paths

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
    paths = server_paths('LOAD_TEST_UNIT_PATH', 'LOAD_TEST_COMPRESSION_OVERRIDE_PATH')
    unit = paths['LOAD_TEST_UNIT_PATH']
    conf = paths['LOAD_TEST_COMPRESSION_OVERRIDE_PATH']
    if unit.name != UNIT + '.service' or not unit.is_file():
        raise SystemExit('Development unit missing')
    if conf.parent != unit.with_name(unit.name + '.d') or conf.name != 'load-test-compression.conf':
        raise SystemExit('Override must belong to the development unit')
    if conf.is_symlink():raise SystemExit('Override must not be a symlink')
    if args.action=='revert':
        if conf.read_text()!=CONFIG:raise SystemExit('Refusing to remove an unrelated configuration')
        conf.unlink();restart();print('Development compression override reverted');return
    if conf.exists():raise SystemExit('Experiment override already exists')
    before=request('identity')
    conf.parent.mkdir(exist_ok=True)
    try:
        conf.write_text(CONFIG);conf.chmod(0o644);restart()
        after=request('gzip');plain=request('identity')
        assert after['encoding']=='gzip',after['encoding']
        assert before['json']==after['json']==plain['json'],'Response content changed'
        assert plain['encoding'] is None,'Identity request was compressed'
        print(json.dumps({'before_bytes':before['wire_bytes'],'after_bytes':after['wire_bytes'],
                          'decoded_sha256':after['sha256'],'json_identical':True}))
    except BaseException:
        conf.unlink(missing_ok=True);restart();raise

if __name__ == '__main__':
    try:
        main()
    except OSError:
        raise SystemExit('Development compression path is inaccessible') from None
