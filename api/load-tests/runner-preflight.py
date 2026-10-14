"""Read-only development runner preflight. Never deploys or starts a load."""
import gzip
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--require-compression', action='store_true')
    parser.add_argument('--require-no-compression', action='store_true')
    args = parser.parse_args()
    if not Path('/etc/systemd/system/todiscount-be-dev.service').exists():
        raise SystemExit('Development service missing')
    service = subprocess.check_output(
        ['systemctl', 'is-active', 'todiscount-be-dev'], text=True).strip()
    request = urllib.request.Request('http://127.0.0.1:8080/api/brands',
                                    headers={'Accept-Encoding': 'gzip'})
    with urllib.request.urlopen(request, timeout=5) as response:
        body = response.read()
        encoding = response.headers.get('Content-Encoding')
        decoded = gzip.decompress(body) if encoding == 'gzip' else body
        assert isinstance(json.loads(decoded), list), 'Unexpected response'
    with urllib.request.urlopen('http://127.0.0.1:9090/actuator/prometheus', timeout=5) as response:
        metrics_status = response.status
    # Listing permission for a harmless exact command does not execute it.
    sudo_check = subprocess.run(['sudo', '-n', '-l', '/usr/bin/python3'],
                                capture_output=True, text=True)
    print(json.dumps({'service': service, 'metrics_http_status': metrics_status,
                      'content_encoding': encoding, 'wire_bytes': len(body),
                      'decoded_sha256': hashlib.sha256(decoded).hexdigest(),
                      'python_sudo_allowed': sudo_check.returncode == 0}, indent=2), flush=True)
    if args.require_compression or args.require_no_compression:
        assert not (args.require_compression and args.require_no_compression), 'Choose one compression state'
        expected = 'gzip' if args.require_compression else None
        assert encoding == expected, 'Expected compression state is not deployed'
        deployment = json.loads(Path('/opt/todiscount-be-dev/deployment.json').read_text())
        import os
        assert deployment['commit'] == os.environ['GITHUB_SHA'], 'Expected dev deployment missing'
    elif sudo_check.returncode:
        raise SystemExit('Runner cannot apply/revert temporary compression: administrator setup required. No load started.')


if __name__ == '__main__':
    main()
