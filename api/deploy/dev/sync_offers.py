#!/usr/bin/python3
"""Apply a production offer snapshot to the development service only."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import urllib.request

DATA = Path('/var/lib/todiscount-be-dev/export.json')
RUNNER = Path('/var/lib/todiscount-runner')
LIMIT = 10 * 1024 * 1024


def validate(content):
    if len(content) > LIMIT:
        raise ValueError('Offer snapshot exceeds 10 MiB')
    rows = json.loads(content)
    if not isinstance(rows, list) or not rows:
        raise ValueError('Expected a nonempty offer ledger array')
    for row in rows:
        if not isinstance(row, dict) or any(not isinstance(row.get(k), str) or not row[k].strip()
                                            for k in ('brand', 'platform')):
            raise ValueError('Invalid offer ledger record')
        if str(row.get('rawText', '')).startswith('[샘플]'):
            raise ValueError('Production snapshot contains sample offers')
    return rows


def api(path, method='GET'):
    request = urllib.request.Request('http://127.0.0.1:8080' + path, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def replace_file(target, content, metadata):
    fd, name = tempfile.mkstemp(prefix='.export-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
            if os.geteuid() == 0:
                os.fchown(output.fileno(), metadata.st_uid, metadata.st_gid)
            os.fchmod(output.fileno(), stat.S_IMODE(metadata.st_mode))
        os.replace(name, target)
    finally:
        Path(name).unlink(missing_ok=True)


def reload_and_verify(expected_count, request=api):
    result = request('/api/reload', 'POST')
    if not isinstance(result, dict) or result.get('reloaded') != expected_count:
        raise RuntimeError('Development reload count mismatch')
    if result.get('pushImmediateSent', 0):
        raise RuntimeError('Development reload unexpectedly sent push notifications')
    brands = request('/api/brands')
    if not isinstance(brands, list) or not brands:
        raise RuntimeError('Development brands response is empty or invalid')


def sync(content, target=DATA, request=api):
    rows = validate(content)
    metadata = target.lstat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError('Development ledger must be a regular file')
    previous = target.read_bytes()
    old_rows = json.loads(previous)
    if not isinstance(old_rows, list):
        raise ValueError('Existing development ledger is invalid')
    # Retain the exact previous file, including permissions, for manual recovery.
    replace_file(target.with_name('export.before-sync.json'), previous, metadata)
    replace_file(target, content, metadata)
    try:
        reload_and_verify(len(rows), request)
    except Exception as failure:
        replace_file(target, previous, metadata)
        try:
            reload_and_verify(len(old_rows), request)
        except Exception as rollback:
            raise RuntimeError('Snapshot restored, but development API rollback reload failed') from rollback
        raise RuntimeError('Offer sync failed; previous development snapshot restored') from failure
    return {'offers': len(rows), 'sha256': hashlib.sha256(content).hexdigest(),
            'synced_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: todiscount-sync-offers-dev <snapshot>')
    # Do not allow the runner to redirect this root-owned helper to other services.
    pid = subprocess.check_output(['systemctl', 'show', 'todiscount-be-dev', '--property=MainPID', '--value'], text=True).strip()
    if not pid.isdecimal() or int(pid) == 0:
        raise SystemExit('Development API is not running')
    settings = Path(f'/proc/{pid}/environ').read_bytes().decode().split('\0')
    values = dict(line.split('=', 1) for line in settings if '=' in line)
    if values.get('DISCOUNT_EXPORT_PATH') != 'file:' + str(DATA):
        raise SystemExit('Development API is not configured to read the expected ledger')
    if values.get('DISCOUNT_PUSH_ENABLED', '').lower() != 'false':
        raise SystemExit('Development push must be disabled before syncing offers')
    source = Path(sys.argv[1]).resolve(strict=True)
    if not source.is_relative_to(RUNNER) or not source.is_file():
        raise SystemExit('Snapshot must be staged inside the development runner directory')
    with (Path('/opt/todiscount-be-dev') / '.deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, 'rb') as input_file:
            if not stat.S_ISREG(os.fstat(input_file.fileno()).st_mode):
                raise SystemExit('Snapshot must be a regular file')
            if not Path(f'/proc/self/fd/{input_file.fileno()}').resolve().is_relative_to(RUNNER):
                raise SystemExit('Snapshot moved outside the development runner directory')
            content = input_file.read(LIMIT + 1)
        result = sync(content)
        print(json.dumps(result))


if __name__ == '__main__':
    main()
