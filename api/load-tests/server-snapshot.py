"""Run over SSH on the development host; emits counters, never credentials."""
import hashlib
import argparse
import json
import time
import urllib.request
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--public-data', action='store_true')
args = parser.parse_args()
paths = ['/opt/todiscount-be-dev/current.jar']
if not args.public_data:
    paths += ['/var/lib/todiscount-be-dev/export.json', '/var/lib/todiscount-be-dev/banners.yml']
hashes = {p: hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in paths}
if args.public_data:
    # The runner cannot read private data files. Fingerprint the actual public responses.
    for endpoint in ['brands', 'banners']:
        req = urllib.request.Request('http://127.0.0.1:8080/api/' + endpoint,
                                     headers={'Accept-Encoding': 'identity', 'User-Agent': 'beggars-load-test/server-monitor'})
        with urllib.request.urlopen(req, timeout=5) as response:
            hashes['response:' + endpoint] = hashlib.sha256(response.read()).hexdigest()
cpu = [int(v) for v in Path('/proc/stat').read_text().splitlines()[0].split()[1:]]
mem = dict((line.split(':')[0], int(line.split()[1])) for line in Path('/proc/meminfo').read_text().splitlines())
unit = subprocess.check_output(['systemctl', 'show', 'todiscount-be-dev', '-p', 'MainPID', '-p', 'NRestarts'], text=True)
metrics = urllib.request.urlopen('http://127.0.0.1:9090/actuator/prometheus', timeout=5).read().decode()
selected = [s for s in metrics.splitlines() if s.startswith(('process_cpu_usage ', 'jvm_memory_used_bytes{',
             'jvm_gc_pause_seconds_', 'tomcat_threads_busy_threads{', 'http_server_requests_seconds_count{',
             'http_server_requests_seconds_sum{'))]
override=Path('/etc/systemd/system/todiscount-be-dev.service.d/load-test-compression.conf')
print(json.dumps({'at': time.time(), 'hashes': hashes, 'data_fingerprint': 'public response bodies' if args.public_data else 'private data files',
                  'cpu': cpu, 'memory_available_ratio': mem['MemAvailable']/mem['MemTotal'],
                  'unit': unit, 'metrics': selected, 'compression_override':override.read_text() if override.exists() else None}))
