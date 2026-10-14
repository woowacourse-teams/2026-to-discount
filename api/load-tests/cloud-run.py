"""GitHub-hosted client guards; server metrics are collected by a separate job."""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import time
from actions_api import job
from run import Guard, point_timestamp

HERE = Path(__file__).resolve().parent


def monitor_ready():
    state = job('load-test-monitor')
    if state and state['status'] == 'completed': raise RuntimeError('Server monitor ended before generator')
    return bool(state and any(s['name'] == 'Monitor development server' and s['status'] == 'in_progress'
                             for s in state.get('steps', [])))


def stop(proc):
    if proc.poll() is None:
        proc.terminate()
        try: proc.wait(timeout=15)
        except subprocess.TimeoutExpired: proc.kill(); proc.wait()


def stage(directory, name, rate, duration):
    if not monitor_ready(): raise RuntimeError('Server monitor unavailable')
    env = dict(os.environ, RATE=str(rate), DURATION=duration, RUN_ID=name,
               REQUIRE_COMPRESSION='true', SUMMARY_FILE=str(directory / (name + '.summary.json')))
    raw = directory / (name + '.ndjson'); guard = Guard(); offset = 0; carry = ''; reason = None
    with (directory / (name + '.log')).open('w') as log:
        proc = subprocess.Popen(['k6', 'run', '--quiet', '--out', 'json=' + str(raw),
                                 str(HERE / 'read-api.js')], env=env, stdout=log, stderr=log)
        try:
            while proc.poll() is None:
                time.sleep(15)
                if not monitor_ready(): raise RuntimeError('Server monitor unavailable')
                if raw.exists():
                    with raw.open() as f:
                        f.seek(offset); text = carry + f.read(); offset = f.tell()
                    rows = text.split('\n'); carry = rows.pop()
                    for row in rows:
                        item = json.loads(row)
                        if item.get('type') != 'Point': continue
                        metric = item['metric']; value = item['data']['value']
                        if metric == 'dropped_iterations' and value: reason = 'dropped_iterations'
                        if metric in ('client_elapsed', 'request_failed'):
                            guard.points.append((point_timestamp(item['data']['time']), metric, value))
                # Server memory is assessed independently by server-monitor.py.
                reason = reason or guard.assess(time.time(), 1, 0)
                if reason:
                    proc.send_signal(signal.SIGINT); proc.wait(timeout=15); break
            code = proc.wait()
        except BaseException as error:
            reason = type(error).__name__ + ': ' + str(error); stop(proc); code = proc.returncode
            raise
        finally:
            stop(proc)
            result = {'stage': name, 'rate': rate, 'duration': duration,
                      'exit_code': proc.returncode, 'stopped': reason}
            with (directory / 'runs.ndjson').open('a') as f: f.write(json.dumps(result) + '\n')
            print(json.dumps(result), flush=True)
    if reason or code not in (0, 99): raise RuntimeError(result)


def main():
    p = argparse.ArgumentParser(); p.add_argument('directory', type=Path)
    args = p.parse_args(); args.directory.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + 180
    while not monitor_ready():
        if time.monotonic() > deadline: raise RuntimeError('Server monitor startup timed out')
        time.sleep(5)
    stages = [('warmup', 2, '2m')] + [(f'compare-{n}', 30, '5m') for n in range(1, 4)]
    for i, (name, rate, duration) in enumerate(stages):
        if i > 1: time.sleep(120)
        stage(args.directory, name, rate, duration)


if __name__ == '__main__': main()
