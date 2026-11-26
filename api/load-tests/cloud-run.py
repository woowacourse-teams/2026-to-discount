"""GitHub-hosted client guards; server metrics are collected by a separate job."""
import argparse
import os
from pathlib import Path
import time
from actions_api import job
from run import run_k6

def monitor_ready():
    state = job('load-test-monitor')
    if state and state['status'] == 'completed': raise RuntimeError('Server monitor ended before generator')
    return bool(state and any(s['name'] == 'Monitor development server' and s['status'] == 'in_progress'
                             for s in state.get('steps', [])))


def stage(directory, name, rate, duration):
    if not monitor_ready():
        raise RuntimeError('Server monitor unavailable')

    def tick(proc):
        if not monitor_ready():
            raise RuntimeError('Server monitor unavailable')
        return None, 1, 0  # server memory and CPU are assessed by server-monitor.py

    run_k6(directory, name, rate, duration, tick,
           {'REQUIRE_COMPRESSION': os.environ.get('REQUIRE_COMPRESSION', 'true')})


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
