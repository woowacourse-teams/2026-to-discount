<!-- 원본: tracker docs/specs/2026-10-01-device-profiles-step3-plan.md — 여기서 고치지 않는다 -->
# 이슈 #4 3단계 이동 계획과 환경 종속성 (2026-10-01)

설계 에이전트가 코드만 읽고 짠 계획이다(실행 안 함, 함수 목록은 grep 기반이라 빠진 것이 있을 수 있다).
상위 설계: `2026-10-01-device-profiles-design.md`.

## A) 이동 계획

### A-0. 공용 선행 작업(한 담당, 앱 작업 전에 머지)

공용 담당만 `capture/common.py`, `capture/guards.py`, `capture/driver/*`를 고친다.

1. Driver 보강: `find(label=, rid=, desc=, prefix=)`, `wait_for(pred, timeout)`, `swipe_ratio(rx, ry1, ry2)`, `clipboard()`(기본 NotImplementedError).
2. common.py 어댑터화: `run_adb`, `dump_ui`, `tap_center`, `swipe_up`/`swipe_ref`, `find_node_bounds*`, `has_node`, `find_card_bounds`, `wait_for_*`, `go_back_and_verify`, `landing_check` 시그니처는 그대로, 안쪽만 AndroidDriver 위임.
3. guards.py: `tappable`, `_node_bounds`, `dismiss`, `clear_before_entry`를 Node 기반으로, drv 오버로드 추가(serial 버전 유지). `dialog_close_point`·`close_blind_dialog`는 Android 전용이라 `AndroidDriver.close_blind_dialog()`로.
4. 이후 앱 작업 중 공용 파일 동결. 필요한 공용 기능은 앱 파일 임시 도우미 → 4단계에서 공용으로.

### A-1. adb·좌표·XML 정규식에 직접 묶인 함수

| 앱 | 파일 | 함수 |
|---|---|---|
| 배민 | baemin.py | capture_club_lounge, open_baejjang, open_brand_lounge, open_club_lounge, sweep_weekend_deals, sweep_brand_lounge, sweep_baejjang_brand_deals, _wait_for_tabs, _uncheck_nearby_only, _checkbox_bounds, _webview_bounds, _find_brand_card, _tap_by_text, _tap_desc_or_text, _save_baejjang_evidence, capture_brand_panels, read_today_hotdeal, collect_brand_details |
| 배민 | baemin_baejjang_parse.py | _text_cells, _brand_buttons |
| 배민 | baemin_couponbox.py | open_coupon_box, _launch_and_wait, _in_app |
| 배민 | brand_links.py | open_baemin_coupon_sheet, _open_and_read, _clickable_nodes, brand_page_is_open, wait_for_baemin_brand_page, reset_app_session, has_coupon_affordance |
| 쿠팡이츠 | coupangeats.py | _keys_on_screen, _back_to_hub, _rows, _has_amount, harvest_keys, collect, open_promotion |
| 쿠팡이츠 | coupangeats_hub.py | _scan_hub, _parse_deals_screen, _open_visible_cards, find_hub_key, visible_label_spot, _claim_visible |
| 쿠팡이츠 | coupangeats_couponbox.py | read_coupon_box, _screen_texts, open_coupon_box, reach_home, _tap_my_tab_fallback |
| 쿠팡이츠 | coupangeats_nav.py / coupangeats_share.py | _tap_text, _foreground / find_share_button, _nodes |
| 요기요 | yogiyo.py | open_discount_tab, _scroll_target_into_safe_zone, sweep_brand_coupons, current_fr_id |
| 요기요 | yogiyo_address.py | _text_rows, _clear_focus_on_sheet, _tap_row, select_saved_address, launch_home, _home_label_after_change, open_address_sheet, _keyboard_shown |
| 요기요 | yogiyo_couponbox.py / yogiyo_event.py / yogiyo_parse.py | open_coupon_box, collect / _texts, open_event / _texts, _nav_bar_top, _brands_on_screen |
| 땡겨요 | ddangyo.py | open_ttaeng_list, open_brand_coupons, sweep_brand_coupons, sweep_all_cards, ttaeng_cards, _rows, _tap_text, _scroll_into_view, _benefit_candidates, _tap_benefit_by_position(위치 탭), copy_event_link(scrcpy 클립보드) |

### A-2. 옮기는 법(공통)

1. 파서 먼저: `f(xml)` → `f_nodes(nodes)`, 옛 이름은 `f(xml) = f_nodes(parse_nodes(xml))`. 골든 테스트로 같음을 증명.
2. 순회: `serial` → `drv: Driver`. 탭은 `tap_node`, 위치만 있으면 `tap_ratio`, 스크롤 `swipe_ratio`, 뒤로 `back`. 진입 직전 `clear_before_entry`.
3. scripts 진입점에서 드라이버를 만들어 넘긴다.
4. 부재 판정은 양성 신호(빈 목록 문구, 끝 마커)가 있을 때만.

### A-3. 순서와 병렬 경계

| 순서 | 담당 | 파일 |
|---|---|---|
| 0 | 공용 | common.py, guards.py, driver/* |
| 1(병렬) | 요기요 | yogiyo*.py, scripts/yogiyo_*.py |
| 1(병렬) | 쿠팡이츠 | coupangeats*.py, scripts/coupangeats_*.py, open_ce_couponbox.py |
| 1(병렬) | 땡겨요 | ddangyo.py, scripts/ddangyo_links.py |
| 2 | 배민 | baemin*.py, brand_links.py, scripts/baejjang_daily.py, baemin_*.py, sweep_baemin_links.py |
| 3 | 공용 | scripts/full_audit.py, run_routine.py, collect_all.py |
| 4 | 공용 | common.py 정리(serial 버전 삭제, 임시 도우미 승격) |

### A-4. 앱별 실기 검증(하네스 `scripts/collect_trial.ps1`로)

| 앱 | 명령 | 단계 |
|---|---|---|
| 배민 | baejjang_daily.py --write / full_audit.py --platforms baemin / baemin_links.py / baemin_couponbox_daily.py | 2, 4, 4g, 5 |
| 쿠팡이츠 | coupangeats_weekly.py --write / coupangeats_share_link.py / coupangeats_couponbox_daily.py | 3, 3s, 5a |
| 요기요 | full_audit.py --platforms yogiyo / yogiyo_couponbox_daily.py | 4, 5y |
| 땡겨요 | full_audit.py --platforms ddangyo / ddangyo_links.py | 4, 4d |
| 공통 | driver_smoke.py, 마지막에 run_routine.py `[done] FAIL=0` | 1, 끝 |

### A-5. 위험과 되돌리기

| 위험 | 대응 |
|---|---|
| 판독 결과가 달라짐(text/desc 우선순위, 공백) | 골든 테스트, 다르면 그 앱 커밋만 revert |
| 위치 탭이 해상도에서 어긋남(ddangyo _tap_benefit_by_position, CE _tap_my_tab_fallback, yogiyo _scroll_target_into_safe_zone) | 트리 상대 위치 우선, 비율은 최후 수단·근거 주석 |
| 어댑터 버그가 전 앱에 번짐 | 0단계 단독 머지 + driver_smoke + 전체 루틴 1회 통과 후 앱 작업 |
| 예약 실행 중 반쯤 옮긴 코드 | 앱 단위 커밋, 브랜치 실기 검증 후 머지, 옛 serial 래퍼 유지 |
| 가드 누락 | 각 진입 함수 첫 줄 clear_before_entry, grep으로 따로 검토 |

## B) 환경 종속성

| 항목 | 쓰는 곳 | 다른 OS 수집 PC | iOS | 권고 |
|---|---|---|---|---|
| adb(PATH) | common.run_adb, device.py, _env_paths | 설치만 | 없음(WDA 등) | Driver로 흡수 |
| uiautomator·dumpsys·input | common.dump_ui, require_unlocked, guards.focused_window, dialog_frame | 무관 | 전혀 다름 | Driver: tree/nodes/is_unlocked/focused/close_blind_dialog |
| screencap·스크롤 스티칭 | common.screenshot, scroll_capture | 무관 | API 다름 | screenshot은 Driver, 스티칭은 그대로 |
| Windows OCR(scripts/ocr_ko.ps1) | capture/ocr.py | 안 됨 | — | OCR 백엔드를 호스트 어댑터로(맥 Vision, 리눅스 tesseract) |
| scrcpy 클립보드 + Get-Clipboard | ddangyo.copy_event_link, ddangyo_links.py, catch_link.py | pbpaste/xclip | scrcpy 없음 | Driver.clipboard(), 호스트 읽기는 OS별 |
| 작업 스케줄러 discount-after-open | ROUTINE-SPEC §1, after_open_daily.cmd, run_routine.py | launchd/cron | — | 그대로, OS별 래퍼만 문서화 |
| .cmd cp949 CRLF | after_open_daily.cmd | 안 됨 | — | 그대로, 다른 OS는 sh 래퍼 |
| PowerShell 5.1(.ps1) | scripts/*.ps1, ocr.py, 클립보드 | pwsh7(WinRT OCR 없음) | — | 그대로, 파이썬 호출만 추상화 |
| Python 3.14 | 스케줄러, ROUTINE-SPEC §1.2 | python3 이름 | — | 래퍼에서 절대 경로 |
| 경로 구분자 | 문서·.cmd | 대체로 괜찮음 | — | 하드코딩 `\\` grep 점검 |
| 콘솔 인코딩 | ddangyo_links, subprocess decode | 단순해짐 | — | 그대로 |
| ADB_SERIAL, devices.json | _env_paths.detect_serial | 무관 | UDID | 프로필로 흡수(os, id) |
| ADB_TIMEOUT_S, ADB_SLOW_TIMEOUT_S | common.py | 무관 | 이름이 adb 전용 | Driver 설정으로 일반화, 옛 이름 별칭 |
| 데이터·로그 경로 환경변수 | 내보내기·로그 | 경로만 맞추면 됨 | — | 그대로 |
| 원격 업로드(ssh/scp, 키 파일) | _ssh.py, deploy_export.py, ops_upload.py | OpenSSH, 키 권한 | — | 그대로 |
| OPS·PostHog·Vercel·Slack | ops.py, banner_routine.py, slack_notify.py 등 | 무관 | — | 그대로 |
| 발열 읽기(dumpsys) | capture/thermal.py | 무관 | 방법 다름 | Driver.thermal()(iOS 미지원 표시) |

요약: 기기 쪽(adb, uiautomator, dumpsys, screencap, 클립보드, 발열)은 Driver와 프로필로, 호스트 쪽(OCR, 스케줄러,
.cmd/.ps1, 클립보드 읽기)은 "호스트 어댑터" 한 곳에 OS별로, 서버·외부 서비스·데이터 경로는 그대로.
