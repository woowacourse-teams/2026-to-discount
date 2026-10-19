"""Read-only server guard. Fails its job on failure; needs no sudo."""
import argparse
import json
from pathlib import Path
import subprocess
import time
from actions_api import job
from run import Guard

HERE = Path(__file__).resolve().parent


def snapshot():
    return json.loads(subprocess.check_output(
        ['python3', str(HERE / 'server-snapshot.py'), '--public-data'], timeout=20))


def main():
    p = argparse.ArgumentParser(); p.add_argument('directory', type=Path)
    args = p.parse_args(); args.directory.mkdir(parents=True, exist_ok=True)
    before = json.loads((args.directory / 'before.json').read_text())
    guard = Guard(); started = time.monotonic(); generator_started = False
    try:
        while time.monotonic() - started < 1800:
            current = snapshot()
            with (args.directory / 'server.ndjson').open('a') as f:
                f.write(json.dumps(current) + '\n')
            if (current['hashes'] != before['hashes'] or current['unit'] != before['unit']
                    or current['compression_override'] != before['compression_override']):
                raise RuntimeError('Server inputs or service changed')
            reason = guard.assess(time.time(), current['memory_available_ratio'], 0)
            if reason: raise RuntimeError(reason)
            status = job('load-test-generator')
            if status and status['status'] == 'in_progress': generator_started = True
            if status and status['status'] == 'completed':
                if status['conclusion'] != 'success': raise RuntimeError('Generator did not succeed')
                (args.directory / 'after.json').write_text(json.dumps(current, indent=2))
                print('Server monitoring completed; inputs unchanged', flush=True)
                return
            if not generator_started and time.monotonic() - started > 180:
                raise RuntimeError('Generator did not start within 3 minutes')
            time.sleep(15)
        raise RuntimeError('Monitoring deadline exceeded')
    except BaseException as error:
        (args.directory / 'invalid-run.json').write_text(json.dumps({'reason': str(error)}))
        # Let the generator detect this job's failure within its next 15-second check.
        # Do not cancel the workflow: its restoration job must still execute.
        raise


if __name__ == '__main__': main()
