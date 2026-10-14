import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent / filename)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


cloud = load('cloud', 'cloud-run.py')
server = load('server', 'server-monitor.py')


class ActionsRunnerTest(unittest.TestCase):
    def test_unavailable_monitor_prevents_load_launch(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(cloud, 'monitor_ready', return_value=False), patch.object(cloud.subprocess, 'Popen') as launch:
            with self.assertRaises(RuntimeError): cloud.stage(Path(directory), 'probe', 2, '30s')
            launch.assert_not_called()

    def test_monitor_loss_terminates_load_and_records_invalid_stage(self):
        proc = Mock(); proc.poll.return_value = None; proc.returncode = -15
        with tempfile.TemporaryDirectory() as directory, patch.object(cloud, 'monitor_ready', side_effect=[True, False]), patch.object(cloud.subprocess, 'Popen', return_value=proc), patch.object(cloud.time, 'sleep'):
            with self.assertRaises(RuntimeError): cloud.stage(Path(directory), 'probe', 2, '30s')
            proc.terminate.assert_called()
            result = json.loads((Path(directory) / 'runs.ndjson').read_text())
            self.assertIn('Server monitor unavailable', result['stopped'])

    def test_completed_server_monitor_is_not_ready(self):
        with patch.object(cloud, 'job', return_value={'status': 'completed'}):
            with self.assertRaises(RuntimeError): cloud.monitor_ready()

    def test_changed_server_inputs_cancel_current_workflow(self):
        before = {'hashes': {'jar': 'old'}, 'unit': 'unchanged', 'compression_override': None}
        after = dict(before, hashes={'jar': 'new'})
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'before.json').write_text(json.dumps(before))
            with patch('sys.argv', ['server-monitor.py', directory]), patch.object(server, 'snapshot', return_value=after), patch.object(server, 'request') as cancel:
                with self.assertRaises(RuntimeError): server.main()
                cancel.assert_called_once_with('/cancel', 'POST')
                self.assertTrue((Path(directory) / 'invalid-run.json').exists())


if __name__ == '__main__': unittest.main()
