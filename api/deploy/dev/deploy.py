#!/usr/bin/python3
"""Root-owned deployment entrypoint. Only the development service is managed."""
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path('/opt/todiscount-be-dev')
SERVICE = 'todiscount-be-dev'
ARTIFACT_ROOT = Path('/var/lib/todiscount-runner')
FILES = ('app.jar', 'manifest.json', 'app.jar.sha256')
LOCAL_URL = 'http://127.0.0.1:8080/api/brands'
PUBLIC_URL = 'https://dev-api-todiscount.duckdns.org/api/brands'


def brands_ok(url):
    """Same readiness rule as prod/stage_deploy.py: HTTP 200 with a JSON list."""
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status == 200 and isinstance(json.load(response), list)
    except Exception:
        return False


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b''):
            digest.update(chunk)
    return digest.hexdigest()


def healthy():
    # Only the local port decides readiness; DNS or certificate trouble must not roll back a good release.
    if subprocess.run(['systemctl', 'is-active', '--quiet', SERVICE]).returncode:
        return False
    return brands_ok(LOCAL_URL)


def wait_ready():
    for _ in range(30):
        if healthy():
            return True
        time.sleep(2)
    return False


def point_to(path):
    link = ROOT / 'current.next'
    link.unlink(missing_ok=True)
    link.symlink_to(path)
    link.replace(ROOT / 'current.jar')


def main():
    if len(sys.argv) != 5:
        raise SystemExit('Usage: deploy.py ARTIFACT_DIR COMMIT RUN_ID RUN_ATTEMPT')
    source = Path(sys.argv[1]).resolve()
    sha, run, attempt = sys.argv[2:]
    if not re.fullmatch(r'[0-9a-f]{40}', sha) or not run.isdigit() or not attempt.isdigit():
        raise SystemExit('Invalid release identifiers')
    if not source.is_relative_to(ARTIFACT_ROOT):
        raise SystemExit('Artifact directory must be in the development runner directory')
    with (ROOT / '.deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        # Copy into a root-owned directory before validation and service changes.
        with tempfile.TemporaryDirectory(dir=ROOT) as staging:
            staged = Path(staging)
            for name in FILES:
                path = source / name
                if path.is_symlink() or not path.is_file():
                    raise SystemExit(f'Invalid artifact file: {name}')
                shutil.copyfile(path, staged / name)
            manifest = json.loads((staged / 'manifest.json').read_text())
            expected = {'commit': sha, 'run_id': run, 'run_attempt': attempt,
                        'ref': 'refs/heads/dev',
                        'repository': 'woowacourse-teams/2026-to-discount'}
            if any(manifest.get(k) != v for k, v in expected.items()):
                raise SystemExit('Artifact provenance does not match the requested dev build')
            digest = sha256_file(staged / 'app.jar')
            if digest != manifest.get('sha256') or (staged / 'app.jar.sha256').read_text().split() != [digest, 'app.jar']:
                raise SystemExit('Artifact checksum mismatch')
            release = ROOT / 'releases' / f'{sha}-{run}-{attempt}'
            if release.exists():
                if sha256_file(release / 'app.jar') != digest:
                    raise SystemExit('Existing release has different contents')
            else:
                # Fill a sibling directory first so a failed copy never leaves a half-filled release behind.
                filling = staged / 'release'
                filling.mkdir()
                for name in FILES:
                    shutil.copyfile(staged / name, filling / name)
                    (filling / name).chmod(0o644)
                filling.chmod(0o755)
                os.rename(filling, release)
        current = ROOT / 'current.jar'
        previous = current.resolve() if current.is_symlink() else None
        if previous and not previous.is_relative_to(ROOT / 'releases'):
            raise SystemExit('Invalid previous release')
        point_to(release / 'app.jar')
        success = False
        try:
            subprocess.run(['systemctl', 'restart', SERVICE], check=True)
            success = wait_ready()
        finally:
            if not success:
                if previous and previous.is_file():
                    point_to(previous)
                    try:
                        subprocess.run(['systemctl', 'restart', SERVICE], check=True)
                        restored = wait_ready()
                    except subprocess.CalledProcessError as error:
                        raise RuntimeError('Deployment and rollback restart both failed') from error
                    if not restored:
                        raise RuntimeError('Deployment and rollback readiness checks both failed')
                else:
                    subprocess.run(['systemctl', 'stop', SERVICE], check=True)
                    current.unlink(missing_ok=True)
                print('Deployment failed; previous release restored or first deployment stopped', file=sys.stderr)
        if not success:
            raise SystemExit(1)
        status = dict(manifest, deployed_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
        temp = ROOT / 'deployment.next.json'
        temp.write_text(json.dumps(status, indent=2) + '\n')
        temp.chmod(0o644)
        temp.replace(ROOT / 'deployment.json')
        with (ROOT / 'deployments.jsonl').open('a') as history:
            history.write(json.dumps(status) + '\n')
        if not brands_ok(PUBLIC_URL):
            print(f'Warning: public address is not answering: {PUBLIC_URL}', file=sys.stderr)
        print(f'Deployed {sha} ({run}/{attempt})')


if __name__ == '__main__':
    main()
