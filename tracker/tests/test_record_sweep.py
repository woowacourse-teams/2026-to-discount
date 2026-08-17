"""수집일 기록의 인자 파싱 가드.

날짜가 틀리면 그 수집은 어떤 관측도 못 내린다. 조용히 틀리는 게 최악이라
여기서 막는다.
"""
import record_sweep


def test_note_value_does_not_become_the_date():
    args, note = record_sweep.split_args(["yogiyo", "--note", "브랜드 할인 탭 전수"])
    assert args == ["yogiyo"]
    assert note == "브랜드 할인 탭 전수"


def test_explicit_date_survives_a_note():
    args, note = record_sweep.split_args(["baemin", "2026-08-17", "--note", "브랜드관"])
    assert args == ["baemin", "2026-08-17"]
    assert note == "브랜드관"


def test_non_date_is_rejected(capsys):
    assert record_sweep.main(["record_sweep.py", "yogiyo", "브랜드 할인 탭 전수"]) == 2
    assert "YYYY-MM-DD" in capsys.readouterr().out
