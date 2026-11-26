"""Development-only k6 runner with rolling stop conditions and immutable inputs."""
import argparse
import collections
import json
import math
import os
import re
from pathlib import Path
import signal
import subprocess
import time

HERE = Path(__file__).resolve().parent
HOST = 'ubuntu@dev-api-todiscount.duckdns.org'
KEY = os.environ.get('DEV_SSH_KEY')

def snapshot():
    if not KEY:
        raise RuntimeError('Set DEV_SSH_KEY to the development SSH private key path')
    return json.loads(subprocess.check_output(['ssh', '-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ConnectTimeout=8', HOST, 'sudo -n python3 -'], input=(HERE/'server-snapshot.py').read_bytes(), timeout=20))

def percentile(values, q):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered)*q)-1)] if ordered else 0

def point_timestamp(text):
    from datetime import datetime
    normalized = re.sub(r'\.(\d+)', lambda m: '.' + (m[1] + '000000')[:6], text)
    return datetime.fromisoformat(normalized.replace('Z', '+00:00')).timestamp()

class Guard:
    def __init__(self):
        self.points = collections.deque()
        self.slow = 0
        self.low_memory = 0
        self.hot = 0
    def assess(self, now, available, cpu):
        while self.points and self.points[0][0] < now-30:
            self.points.popleft()
        errors = [x[2] for x in self.points if x[1] == 'request_failed']
        latency = [x[2] for x in self.points if x[1] == 'client_elapsed']
        slow = bool(latency) and percentile(latency, .99) > 3000
        self.slow = self.slow + 15 if slow else 0
        self.low_memory = self.low_memory + 15 if available < .1 else 0
        self.hot = self.hot + 15 if cpu > .95 and slow else 0
        if errors and sum(errors) >= 5 and sum(errors) / len(errors) >= .01:
            return 'rolling failure rate'
        if self.slow >= 60:
            return 'persistent p99 > 3s'
        if self.low_memory >= 30:
            return 'available memory < 10%'
        if self.hot >= 60:
            return 'CPU and latency saturation'
        return None

def stop(proc):
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()


def read_new_points(raw, state, guard):
    """Feed k6 points written since the last call to guard. Returns a stop reason or None."""
    if not raw.exists():
        return None
    with raw.open() as f:
        f.seek(state['offset'])
        text = state['carry'] + f.read()
        state['offset'] = f.tell()
    rows = text.split('\n')
    state['carry'] = rows.pop()  # a line k6 has not finished writing yet
    reason = None
    for row in rows:
        item = json.loads(row)
        if item.get('type') != 'Point':
            continue
        metric = item['metric']
        value = item['data']['value']
        if metric == 'dropped_iterations' and value:
            reason = 'dropped_iterations'
        if metric in ('client_elapsed', 'request_failed'):
            guard.points.append((point_timestamp(item['data']['time']), metric, value))
    return reason


def run_k6(directory, name, rate, duration, tick, extra_env=None):
    """Run one k6 stage. tick(proc) runs every 15s and returns (reason, memory_available_ratio, cpu)."""
    env = dict(os.environ, RATE=str(rate), DURATION=duration, RUN_ID=name,
               SUMMARY_FILE=str(directory / f'{name}.summary.json'), **(extra_env or {}))
    raw = directory / f'{name}.ndjson'
    guard = Guard()
    state = {'offset': 0, 'carry': ''}
    reason = None
    with (directory / f'{name}.log').open('w') as log:
        proc = subprocess.Popen(['k6', 'run', '--quiet', '--out', 'json=' + str(raw), str(HERE / 'read-api.js')],
                                env=env, stdout=log, stderr=log)
        try:
            while proc.poll() is None:
                time.sleep(15)
                tick_reason, available, cpu = tick(proc)
                reason = read_new_points(raw, state, guard) or tick_reason
                reason = reason or guard.assess(time.time(), available, cpu)
                if reason:
                    proc.send_signal(signal.SIGINT)
                    proc.wait(timeout=15)
                    break
            code = proc.wait()
        except BaseException as error:
            reason = f'monitoring failed: {type(error).__name__}: {error}'
            raise
        finally:
            stop(proc)
            result = {'stage': name, 'rate': rate, 'duration': duration,
                      'exit_code': proc.returncode, 'stopped': reason}
            with (directory / 'runs.ndjson').open('a') as f:
                f.write(json.dumps(result) + '\n')
            print(json.dumps(result), flush=True)
    # k6 exit 99 means a proposed latency threshold failed, not a runner failure.
    if reason or code not in (0, 99):
        raise RuntimeError(result)


def run_stage(directory, name, rate, duration, baseline):
    previous = snapshot()

    def tick(proc):
        nonlocal previous
        current = snapshot()
        with (directory / 'server.ndjson').open('a') as f:
            f.write(json.dumps(dict(current, stage=name)) + '\n')
        stats = subprocess.run(['ps', '-p', str(proc.pid), '-o', '%cpu=,rss='], capture_output=True, text=True)
        with (directory / 'generator.ndjson').open('a') as f:
            f.write(json.dumps({'at': time.time(), 'stage': name, 'cpu_rss': stats.stdout.strip()}) + '\n')
        reason = None
        if current['hashes'] != baseline['hashes'] or current['unit'] != baseline['unit']:
            reason = 'data, JAR or service changed'
        if current.get('compression_override') != baseline.get('compression_override'):
            reason = 'experiment configuration changed'
        a, b = previous['cpu'], current['cpu']
        delta = sum(b[:8]) - sum(a[:8])
        idle = (b[3] + b[4]) - (a[3] + a[4])
        previous = current
        return reason, current['memory_available_ratio'], (1 - idle / delta if delta > 0 else 0)

    run_k6(directory, name, rate, duration, tick)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    parser.add_argument('--mode', choices=['smoke', 'explore', 'compare'], default='smoke')
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    before = snapshot()
    (args.directory / 'before.json').write_text(json.dumps(before, indent=2))
    stages = [('smoke', 2, '30s')] if args.mode == 'smoke' else [('warmup', 2, '2m')]
    if args.mode == 'explore':
        stages += [(f'explore-{r}', r, '3m') for r in [2, 10, 30, 60, 100]]
    if args.mode == 'compare':
        stages += [(f'compare-{n}', 30, '5m') for n in range(1, 4)]
    for i, (name, rate, duration) in enumerate(stages):
        if i > 1:
            time.sleep(120)
        run_stage(args.directory, name, rate, duration, before)
    after = snapshot()
    if (before['hashes'] != after['hashes'] or before['unit'] != after['unit']
            or before.get('compression_override') != after.get('compression_override')):
        raise RuntimeError('inputs changed')
    (args.directory / 'after.json').write_text(json.dumps(after, indent=2))


if __name__ == '__main__':
    main()
