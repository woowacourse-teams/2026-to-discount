"""알림 안내 미리보기가 실험 모집단에 섞이지 않는지 검증한다."""
import json
import tempfile
import unittest
from pathlib import Path

import experiments


class PreviewAggregationTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.temp_path = Path(temp.name)

    def test_preview_prompt_does_not_create_visitors_or_change_real_visitors(self):
        tmp_path = self.temp_path
        entries = [
            {"visitorId": "real", "event": "page_view", "ts": "2026-10-08T01:00:00Z"},
            *[{"visitorId": visitor, "event": event, "props": {"source": "preview"},
               "dev": True, "ts": "2026-10-07T01:00:00Z"}
              for visitor in ("preview-only", "real")
              for event in ("push_prompt_viewed", "push_prompt_enable_clicked", "push_prompt_closed")],
            {"visitorId": "real", "event": "push_prompt_viewed", "props": {"source": "offer"}},
            {"visitorId": "other", "event": "offer_link_click", "props": {"source": "preview"}},
        ]
        source = tmp_path / "events.jsonl"
        original = "\n".join(json.dumps(event) for event in entries)
        source.write_text(original, encoding="utf-8")
        people, rows = experiments.load(source)
        assert set(people) == {"real", "other"}
        assert len(rows) == 3
        assert not people["real"].dev
        assert people["real"].first_ts == "2026-10-08T01:00:00Z"
        assert people["real"].events["push_prompt_viewed"] == 1
        assert source.read_text(encoding="utf-8") == original


    def test_prompt_without_preview_dictionary_is_preserved(self):
        tmp_path = self.temp_path
        entries = [{"visitorId": str(index), "event": "push_prompt_closed", "props": props}
                   for index, props in enumerate((None, "preview", {}, {"source": "offer"}))]
        source = tmp_path / "events.jsonl"
        source.write_text("\n".join(json.dumps(event) for event in entries), encoding="utf-8")
        people, rows = experiments.load(source)
        assert len(people) == 4
        assert len(rows) == 4
