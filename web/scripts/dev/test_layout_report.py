"""layout-report.py 시험(#146). python3 -m unittest discover -s web/scripts/dev -p 'test_*.py'"""
import contextlib
import importlib.util
import io
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

_spec = importlib.util.spec_from_file_location("layout_report", Path(__file__).with_name("layout-report.py"))
lr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lr)


class ServeTest(unittest.TestCase):
    def start(self, live):
        srv = lr.serve(Path(self.tmp.name) / "reports", live, port=0)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        return f"http://127.0.0.1:{srv.server_address[1]}"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.live = Path(self.tmp.name) / "live"
        self.live.mkdir()
        (self.live / "brands.json").write_text('[{"name":"운영"}]', encoding="utf-8")
        (self.live / "banners.json").write_text("[]", encoding="utf-8")

    def brands(self, base):
        return urllib.request.urlopen(base + "/api/brands").read()

    def set(self, base, kind):
        req = urllib.request.Request(f"{base}/data?set={kind}", method="POST", data=b"")
        try:
            return urllib.request.urlopen(req).status
        except urllib.error.HTTPError as e:
            return e.code

    def test_switches_to_live(self):
        base = self.start(self.live)
        fixture = (lr.FIXTURES / "brands.json").read_bytes()
        self.assertEqual(self.brands(base), fixture)
        self.assertEqual(self.set(base, "live"), 204)
        self.assertEqual(json.loads(self.brands(base)), [{"name": "운영"}])
        self.assertEqual(self.set(base, "fixture"), 204)
        self.assertEqual(self.brands(base), fixture)

    def test_live_missing_is_409_and_keeps_fixture(self):
        base = self.start(None)
        self.assertEqual(self.set(base, "live"), 409)
        self.assertEqual(self.brands(base), (lr.FIXTURES / "brands.json").read_bytes())


class SummaryTest(unittest.TestCase):
    def run_summary(self, index, reports, today=date(2026, 10, 20)):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            for i, r in enumerate(reports):
                (out / f"{i}.json").write_text(json.dumps(r), encoding="utf-8")
            (out / "index.txt").write_text(index, encoding="utf-8")
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                code = lr.summary(out, out / "index.txt", today)
        return code, buf.getvalue()

    A = "http://localhost:5173/?home=a&expect=carousel"
    L = "http://localhost:5173/?home=a&tab=1"

    def test_strips_data_suffix_and_dates_on_top(self):
        code, text = self.run_summary(f"1 {self.A} data=fixture at=2026-10-16\n2 {self.L} data=live at=2026-10-22\n",
                                      [{"url": self.A, "fails": []}, {"url": self.L, "fails": []}])
        self.assertEqual(code, 0, text)
        head = text.splitlines()[2:4]
        self.assertIn("2026-10-22", head[0])
        self.assertIn("2026-10-16", head[1])

    def test_missing_fixture_report_fails(self):
        code, text = self.run_summary(f"1 {self.A} data=fixture at=2026-10-16\n", [])
        self.assertEqual(code, 1)
        self.assertIn("보고가 없다", text)

    def test_live_problems_only_warn(self):
        code, text = self.run_summary(f"1 {self.L} data=live at=2026-10-22\n2 {self.L}&scroll=end data=live at=2026-10-22\n",
                                      [{"url": self.L, "fails": ["가로 넘침"]}])
        self.assertEqual(code, 0, text)
        self.assertEqual(text.count("- 경고"), 2)

    def test_switch_failure_fails_even_for_live(self):
        code, text = self.run_summary(f"1 {self.L} data=live at=2026-10-22 switch=409\n", [])
        self.assertEqual(code, 1, text)
        self.assertIn("- 실패", text)
        self.assertIn("전환이 실패", text)

    def test_stale_fixture_warns(self):
        code, text = self.run_summary(f"1 {self.A} data=fixture at=2026-10-01\n", [{"url": self.A, "fails": []}])
        self.assertEqual(code, 0)
        self.assertIn("경고: 고정 데이터가 19일", text)


if __name__ == "__main__":
    unittest.main()
