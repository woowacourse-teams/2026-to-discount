"""Run over SSH on the development host; emits counters, never server paths."""
import hashlib
import argparse
import json
import os
import shlex
import time
import urllib.request
from pathlib import Path
import subprocess

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--public-data', action='store_true')
    args = parser.parse_args()
    names = ['LOAD_TEST_JAR_PATH', 'LOAD_TEST_COMPRESSION_OVERRIDE_PATH',
             'LOAD_TEST_CPU_STAT_PATH', 'LOAD_TEST_MEMINFO_PATH']
    if not args.public_data:
        names += ['LOAD_TEST_EXPORT_PATH', 'LOAD_TEST_BANNERS_PATH']
    paths = server_paths(*names)
    hashes = {'jar': hashlib.sha256(paths['LOAD_TEST_JAR_PATH'].read_bytes()).hexdigest()}
    if not args.public_data:
        for label, name in [('export', 'LOAD_TEST_EXPORT_PATH'), ('banners', 'LOAD_TEST_BANNERS_PATH')]:
            hashes[label] = hashlib.sha256(paths[name].read_bytes()).hexdigest()
    else:
        # The runner cannot read private data files. Fingerprint public responses.
        for endpoint in ['brands', 'banners']:
            req = urllib.request.Request('http://127.0.0.1:8080/api/' + endpoint,
                headers={'Accept-Encoding': 'identity', 'User-Agent': 'beggars-load-test/server-monitor'})
            with urllib.request.urlopen(req, timeout=5) as response:
                hashes['response:' + endpoint] = hashlib.sha256(response.read()).hexdigest()
    cpu = [int(v) for v in paths['LOAD_TEST_CPU_STAT_PATH'].read_text().splitlines()[0].split()[1:]]
    mem = dict((line.split(':')[0], int(line.split()[1]))
               for line in paths['LOAD_TEST_MEMINFO_PATH'].read_text().splitlines())
    unit = subprocess.check_output(['systemctl', 'show', 'todiscount-be-dev', '-p', 'MainPID', '-p', 'NRestarts'], text=True)
    with urllib.request.urlopen('http://127.0.0.1:9090/actuator/prometheus', timeout=5) as response:
        metrics = response.read().decode()
    selected = [s for s in metrics.splitlines() if s.startswith(('process_cpu_usage ', 'jvm_memory_used_bytes{',
                 'jvm_gc_pause_seconds_', 'tomcat_threads_busy_threads{', 'http_server_requests_seconds_count{',
                 'http_server_requests_seconds_sum{'))]
    override = paths['LOAD_TEST_COMPRESSION_OVERRIDE_PATH']
    # Record only presence and content fingerprint; an unrelated drop-in may contain paths.
    override_hash = hashlib.sha256(override.read_bytes()).hexdigest() if override.exists() else None
    print(json.dumps({'at': time.time(), 'hashes': hashes,
        'data_fingerprint': 'public response bodies' if args.public_data else 'private data files',
        'cpu': cpu, 'memory_available_ratio': mem['MemAvailable']/mem['MemTotal'],
        'unit': unit, 'metrics': selected, 'compression_override': override_hash}))


if __name__ == '__main__':
    try:
        main()
    except OSError:
        raise SystemExit('Development snapshot path is inaccessible') from None
