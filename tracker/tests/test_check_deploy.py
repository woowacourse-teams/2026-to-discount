import json

from check_deploy import latest_capture, main, staleness, vanishing


def rec(brand, platform, captured):
    return {"brand": brand, "platform": platform, "capturedAt": captured}


def test_latest_capture_of_empty_is_earlier_than_anything():
    assert latest_capture([]) < "2026-08-01T00:00:00+09:00"


def test_stale_commit_is_blocked():
    """2026-08-05 실측 재현: 서버가 더 최신인데 낡은 커밋을 밀려는 상황."""
    server = [rec("열정국밥", "baemin", "2026-08-04T15:05:00+09:00")]
    incoming = [rec("BBQ", "ddangyo", "2026-08-03T16:34:00+09:00")]
    assert staleness(incoming, server) is not None


def test_up_to_date_deploy_passes():
    server = [rec("BBQ", "ddangyo", "2026-08-03T16:34:00+09:00")]
    incoming = [rec("BBQ", "ddangyo", "2026-08-05T12:00:00+09:00")]
    assert staleness(incoming, server) is None


def test_expired_promotion_removal_is_not_blocked():
    """만료로 레코드가 줄어드는 건 정상이다 — 건수로 재면 오탐이 난다."""
    server = [rec("BBQ", "ddangyo", "2026-08-01T00:00:00+09:00"),
              rec("bhc", "ddangyo", "2026-08-01T00:00:00+09:00")]
    incoming = [rec("BBQ", "ddangyo", "2026-08-05T00:00:00+09:00")]
    assert staleness(incoming, server) is None
    assert vanishing(incoming, server) == [("bhc", "ddangyo")]


def test_detail_loss_is_blocked_even_when_capture_times_match():
    """2026-08-05 실측 재현: 캡처 시각이 같아 통과했는데 상세만 사라졌다."""
    server = [dict(rec("청년피자", "ddangyo", "2026-07-31T16:00:00+09:00"),
                   tiers=[{"minOrder": 18900, "amount": 9000}], badge="포장 +1,000")]
    incoming = [dict(rec("청년피자", "ddangyo", "2026-07-31T16:00:00+09:00"),
                     tiers=None, badge=None)]
    assert staleness(incoming, server) is not None


def test_filling_in_a_previously_empty_detail_is_fine():
    server = [rec("청년피자", "ddangyo", "2026-07-31T16:00:00+09:00")]
    incoming = [dict(rec("청년피자", "ddangyo", "2026-07-31T16:00:00+09:00"),
                     badge="포장 +1,000")]
    assert staleness(incoming, server) is None


def test_main_blocks_stale_and_reports_vanishing(tmp_path, capsys):
    server = tmp_path / "server.json"
    incoming = tmp_path / "incoming.json"
    server.write_text(json.dumps([rec("열정국밥", "baemin", "2026-08-04T15:05:00+09:00")]),
                      encoding="utf-8")
    incoming.write_text(json.dumps([rec("BBQ", "ddangyo", "2026-08-03T16:34:00+09:00")]),
                        encoding="utf-8")

    assert main(["check_deploy.py", str(incoming), str(server)]) == 1
    out = capsys.readouterr().out
    assert "열정국밥" in out
    assert "배포 중단" in out


def test_manual_entry_on_server_does_not_block_regular_deploy():
    """2026-08-18 실측 재현: 서버에 원장 밖 수기입력 레코드가 있으면 정상
    갱신한 커밋이 영원히 '낡았다'고 막혔다."""
    server = [dict(rec("스타벅스", "ddangyo", "2026-08-18T10:30:00+09:00"),
                    screenshotPath="수기작성")]
    incoming = [rec("BBQ", "ddangyo", "2026-08-17T18:08:17+09:00")]
    assert staleness(incoming, server) is None


def test_manual_entry_detail_does_not_block_when_ledger_lacks_it():
    """수기입력 레코드가 상세를 채워 갖고 있어도, 정식 원장에 그 상세가
    없다는 이유로 배포를 막지 않는다 — 비교 대상 자체가 정식 경로 밖이다."""
    server = [dict(rec("세븐일레븐", "yogiyo", "2026-08-18T01:11:27+09:00"),
                    screenshotPath="수기입력", minOrderAmount=20000)]
    incoming = [rec("세븐일레븐", "yogiyo", "2026-08-19T00:00:00+09:00")]
    assert staleness(incoming, server) is None


def test_empty_string_is_not_a_filled_detail():
    """2026-08-19 실측 재현: 서버의 conditions ''가 '채워진 값'으로 잘못
    세져, 다음 배포에서 None으로 정리될 때마다 실손실 없이 막혔다."""
    server = [dict(rec("열정국밥", "baemin", "2026-08-17T18:08:17+09:00"),
                    conditions="")]
    incoming = [dict(rec("열정국밥", "baemin", "2026-08-19T10:18:34+09:00"),
                      conditions=None)]
    assert staleness(incoming, server) is None


def test_min_order_moving_into_tiers_is_not_a_loss():
    """2026-08-19 실측 재현: cumulative로 정정하며 minOrderAmount가
    tiers 안 min_order로 옮겨갔는데 손실로 오판돼 배포가 막혔다."""
    server = [dict(rec("굽네치킨", "yogiyo", "2026-08-17T01:11:27+09:00"),
                    minOrderAmount=25000, tiers=None)]
    incoming = [dict(rec("굽네치킨", "yogiyo", "2026-08-19T10:49:57+09:00"),
                      minOrderAmount=None,
                      tiers=[{"minOrder": 17000, "amount": 4000},
                             {"minOrder": 25000, "amount": 1250, "percent": 5, "cap": 3000}])]
    assert staleness(incoming, server) is None


def test_main_passes_when_server_file_absent(tmp_path):
    incoming = tmp_path / "incoming.json"
    incoming.write_text(json.dumps([rec("BBQ", "ddangyo", "2026-08-05T00:00:00+09:00")]),
                        encoding="utf-8")
    assert main(["check_deploy.py", str(incoming), str(tmp_path / "nope.json")]) == 0


def test_newer_capture_may_replace_an_expired_coupon():
    """더 최신 관측이 옛 조건을 안 들고 있는 것은 손실이 아니다.

    2026-08-24 실측: 또래오래 배민이 08-23 만료 쿠폰(19,000/4,000)을
    들고 있었는데 08-24 캡처는 새 쿠폰(15,000/3,500)을 봤다. 쿠폰은
    끝나고 갈리므로, 시각을 안 보면 정상 갱신마다 배포가 막힌다.
    """
    server = [dict(rec("또래오래", "baemin", "2026-08-17T10:00:00+09:00"),
                   tiers=[{"minOrder": 19000, "amount": 4000}],
                   expiresAt="2026-08-23")]
    incoming = [dict(rec("또래오래", "baemin", "2026-08-24T12:00:00+09:00"),
                     amount=3500, minOrderAmount=15000)]
    assert staleness(incoming, server) is None


def test_same_day_capture_that_drops_detail_is_still_blocked():
    """같은 날 캡처끼리는 그대로 막는다.

    이 가드가 원래 잡으려던 사고가 "시각이 같은데 내용만 비는" 경우다
    (2026-08-05 청년피자 tiers·badge 소실). 위 완화가 그 구멍을 다시
    열면 안 된다.
    """
    server = [dict(rec("청년피자", "ddangyo", "2026-07-31T16:00:00+09:00"),
                   tiers=[{"minOrder": 18900, "amount": 5000}])]
    incoming = [rec("청년피자", "ddangyo", "2026-07-31T16:00:00+09:00")]
    assert staleness(incoming, server) is not None
