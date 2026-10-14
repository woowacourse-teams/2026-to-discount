import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, Mock
from run import Guard, point_timestamp, run_stage

class GuardTest(unittest.TestCase):
    def test_failed_preflight_never_starts_a_load_process(self):
        with tempfile.TemporaryDirectory() as tmp, patch('run.snapshot',side_effect=RuntimeError('unreachable')), patch('run.subprocess.Popen') as launch:
            with self.assertRaises(RuntimeError):run_stage(Path(tmp),'probe',2,'30s',{})
            launch.assert_not_called()

    def test_monitor_failure_terminates_load_and_records_invalid_run(self):
        proc=Mock();proc.poll.return_value=None;proc.returncode=-15
        initial={'cpu':[0]*8}
        with tempfile.TemporaryDirectory() as tmp, patch('run.snapshot',side_effect=[initial,RuntimeError('unreachable')]), patch('run.subprocess.Popen',return_value=proc), patch('run.time.sleep'):
            with self.assertRaises(RuntimeError):run_stage(Path(tmp),'probe',2,'30s',initial)
            proc.terminate.assert_called_once()
            result=json.loads((Path(tmp)/'runs.ndjson').read_text())
            self.assertEqual(result['stopped'],'monitoring failed: RuntimeError')
            self.assertEqual(result['exit_code'],-15)
    def test_k6_fractional_timestamp_precision_and_offsets(self):
        expected=point_timestamp('2026-10-14T09:01:43.093390Z')
        self.assertEqual(point_timestamp('2026-10-14T18:01:43.09339+09:00'),expected)
        self.assertEqual(point_timestamp('2026-10-14T09:01:43.093390123Z'),expected)
    def test_expired_failures_do_not_abort_a_recovered_window(self):
        g=Guard()
        for i in range(10):g.points.append((0,'request_failed',1))
        for i in range(100):g.points.append((60,'request_failed',0))
        self.assertIsNone(g.assess(60,.5,.3))

    def test_failed_request_floor_does_not_hide_a_real_failure_rate(self):
        g=Guard()
        for i in range(100):g.points.append((10,'request_failed',int(i<5)))
        self.assertEqual(g.assess(10,.5,.3),'rolling failure rate')

    def test_cpu_saturation_alone_is_not_an_abort(self):
        g=Guard()
        for now in [15,30,45,60,75]:
            g.points.append((now,'client_elapsed',100))
            self.assertIsNone(g.assess(now,.5,.99))

    def test_memory_exhaustion_stops_before_a_latency_sample_exists(self):
        g=Guard()
        self.assertIsNone(g.assess(15,.05,.2))
        self.assertEqual(g.assess(30,.05,.2),'available memory < 10%')

    def test_transient_latency_does_not_accumulate_after_recovery(self):
        g=Guard();g.points.append((0,'client_elapsed',4000))
        self.assertIsNone(g.assess(15,.5,.3))
        g.points.append((45,'client_elapsed',100))
        self.assertIsNone(g.assess(45,.5,.3))
        self.assertEqual(g.slow,0)

if __name__=='__main__':unittest.main()
