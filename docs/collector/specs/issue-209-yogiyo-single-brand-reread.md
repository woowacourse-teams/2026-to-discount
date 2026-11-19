<!-- 원본: tracker docs/specs/issue-209-yogiyo-single-brand-reread.md — 여기서 고치지 않는다 -->
# 설계: 요기요 브랜드 하나를 딥링크로 열어 쿠폰 구간을 다시 읽는 명령 (이슈 #209)

- 상태: 설계 (구현 전). 2026-11-07
- 영역: **collect.** 폰에서 요기요 앱을 열어 읽는다. 4c(`capture/yogiyo.py`의 `sweep_brand_coupons_drv`)도 함께 고친다.
- 읽은 것: 이슈 입력, `AGENTS.md`, `mono/docs/CHANGE-PROPAGATION.md` 전체, `docs/setup/ROUTINE-SPEC.md` 단계 4, 4f, 5y, `docs/research/2026-08-20-yogiyo-franchise-ids.md`, `capture/yogiyo.py`(`sweep_brand_coupons_drv`, `current_fr_id_drv`, `claim_all_coupons`), `capture/yogiyo_parse.py`(`on_brand_detail`, `parse_detail_terms`), `scripts/yogiyo_links.py`(`DEEPLINK`, `verify`), `scripts/yogiyo_claim_probe.py`, `scripts/yogiyo_couponbox_daily.py`(`audit_yogiyo_today`, `compare`), `scripts/build_audit_records.py`(`build_yogiyo`), `tests/test_yogiyo_sweep_lost_brand.py`, `mono/api/src/main/resources/brands.yml`(요기요 링크 줄).
- **읽지 못한 것:** 2026-11-08 00:01 회차 5y 로그와 `captures/yogiyo_couponbox_2026-11-08.json`. 수집 PC에만 있다. CU 어긋남 2건의 실제 문장은 모른다.
- 행 번호는 쓰지 않는다. 함수 이름과 출력 문구로 찾는다.

## 1. 이슈 전제를 바로잡는다: 진입 주소는 이미 있다

이슈는 "요기요 웹이 브랜드 링크를 만드는 방식을 확인해 앱에서 여는 방법을 찾는다"를 첫 일로 둔다. 그 일은 이미 끝나 있다.

| 사실 | 어디에 |
| --- | --- |
| 브랜드관 딥링크 `yogiyolink://push.page/franchise?fr_id=<번호>`. `fr_id`는 캠페인이 아니라 프랜차이즈 고정 번호라 한 번 따면 안 바뀐다 | `docs/research/2026-08-20-yogiyo-franchise-ids.md` 요약 |
| 그 링크로 연 화면에 쿠폰받기가 있고, 금액과 조건이 목록에서 들어간 화면과 같다(네네치킨, 계근상, 곱분이곱창, 부어치킨) | 같은 문서 "목록은 위치를 타지만 쿠폰은 전국 공통이다". iOS 실기 |
| 안드로이드에서 같은 링크를 열어 `쿠폰받기`/`쿠폰확인`을 누르고 쿠폰 창(`할인 쿠폰`)을 연다 | `scripts/yogiyo_claim_probe.py`(2026-10-02 `b44b1d8`) |
| 4f가 매 전수조사에서 그 링크를 열어 착지를 브랜드 이름으로 확인한다 | `scripts/yogiyo_links.py` `verify` |
| `brands.yml`의 요기요 링크 64줄이 전부 이 꼴이다. CU는 `fr_id=682` | `mono/api/src/main/resources/brands.yml` |
| 웹(`https://yogiyo.airbridge.io/…`)은 앱을 못 연다. https로 앱이 열리는 것은 앱이 발급하는 `ws.yogiyo.co.kr/<단축코드>`뿐이다 | 연구 문서 "스킴은 둘" |

그래서 웹 주소를 조사하는 일은 하지 않는다. 웹 쪽은 앱보다 나은 주소를 줄 수 없다는 것이 08-20에 확인됐다. 이 이슈에 남은 일은 하나다. **딥링크로 연 브랜드 화면에서 4c와 똑같이 읽는 것.**

없는 것은 진입이 아니라 읽기다. 읽는 코드(상세 조건, 쿠폰 창, 쿠폰 받기, `fr_id`)는 `sweep_brand_coupons_drv` 루프 안에 박혀 있어 목록 순회 밖에서 부를 수 없다. `yogiyo_claim_probe.py`는 쿠폰 받기만 시험하고 구간을 읽지 않는다.

## 2. 안: 4c의 브랜드 한 곳 읽기를 함수로 빼고, 딥링크 진입에서 다시 쓴다

### 2-1. 함수 추출 (4c 동작은 그대로)

`capture/yogiyo.py`에 `read_brand_detail_drv(drv, brand, detail_xml, out_dir, date_str, headline) -> dict`를 둔다.

- 몸통은 지금 `sweep_brand_coupons_drv`에서 `detail_xml`을 얻은 뒤부터 쿠폰 창을 닫을 때까지다: 스크린샷, `parse_detail_terms`, `current_fr_id_drv`, `COUPON_BUTTONS` 찾기, `[suspect] 4 요기요 … 쿠폰 버튼을 못 찾았다`, 쿠폰 창 열기, `claim_all_coupons`, `parse_coupon_sheet`, `parse_coupon_rows`, `coupon_unread` 증거, 창 닫기.
- `go_back_and_verify(… LIST_MARKERS)`는 함수 밖, 순회 쪽에 남긴다. 단건 진입에는 돌아갈 목록이 없다.
- 반환하는 dict 모양은 지금 `results[brand]`와 한 글자도 다르지 않다. `build_yogiyo`와 5y `audit_yogiyo_today`가 이 모양을 읽는다(4절).

복사하지 않고 빼는 이유: 같은 읽기가 두 곳에 있으면 4c를 고칠 때 단건 명령이 옛 읽기로 남는다. 그러면 "다시 읽어도 같다"가 같은 결함을 두 번 읽은 결과가 된다. 이 명령의 쓸모가 사라진다.

### 2-2. 새 명령 `scripts/yogiyo_brand.py`

```
python scripts/yogiyo_brand.py <브랜드> [--date YYYY-MM-DD] [--serial S] [--write] [--compare]
```

1. **링크 찾기.** `brands.yml`에서 대표명, `aliases`, `searchAliases` 순으로 브랜드를 찾는다(`yogiyo_links.main`의 별칭 표와 같은 규칙. 함수로 빼서 둘이 같이 쓴다). `links.yogiyo`에서 `fr_id`를 뽑는다.
   - 브랜드가 없으면 종료 코드 2, `brands.yml에 없는 브랜드: <이름>`.
   - 링크가 없거나 `franchise?fr_id=` 꼴이 아니면(검색 링크 등) 종료 코드 2, `요기요 브랜드관 링크가 없다: <이름> (<지금 값>)`.
2. **열기.** `yogiyo_links.DEEPLINK`, `clear_before_entry`, `LANDING_WAIT_S`를 그대로 쓴다. 진입 가드는 링크를 열기 앞에서만 부른다(`verify` 주석과 같은 이유).
3. **착지 확인(양성 신호 셋, 3절).** 하나라도 거짓이면 읽지 않는다. 증거를 남기고 종료 코드 1.
4. **읽기.** `read_brand_detail_drv(drv, 브랜드, xml, out_dir, date, headline=None)`. 목록 헤드라인이 없으니 `None`이다(4절 "헤드라인").
5. **남기기(`--write`).** `captures/yogiyo_brand_<날짜>.json`에 `{브랜드: {**entry, "read_at": 시각, "fr_id_link": 번호, "via": "deeplink"}}`로 쓴다. 같은 날 같은 브랜드를 다시 읽으면 그 키만 바꾸고 다른 브랜드는 둔다. 스크린샷은 `captures/yogiyo_brand_<날짜>/`.
6. **맞대기(`--compare`).** 5절.

원장(`data/log.jsonl`)과 `reports/audit-<날짜>.json`에는 쓰지 않는다. 이 명령은 확인 도구다(4절 "원장").

쿠폰 창을 열면 `claim_all_coupons`가 쿠폰을 **실제로 받는다.** 4c도 받으므로(2026-10-02 사용자 결정, 5y가 쿠폰함에서 맞대려면 받아야 한다) 이 명령도 받는다. 되돌릴 수 없다는 것을 `--help`와 머리말에 적는다.

## 3. "없다 / 0 / 통과"를 내는 자리와 양성 신호

| 자리 | 내는 말 | 그 말을 해도 되는 양성 신호 | 신호가 없을 때 |
| --- | --- | --- | --- |
| 착지 | (읽기 시작) | ① 트리에 `package="com.fineapp.yogiyo"`(`PACKAGE`) ② `on_brand_detail(xml, 이름)`이 대표명, 요기요 이름, 별칭 중 하나로 참 ③ `current_fr_id_drv`가 링크의 `fr_id`와 같다 | ①② 거짓: `[fail] 착지 못 함`, 증거, 종료 1. ③ 다름: `[fail] 다른 브랜드관(fr_id A ≠ 링크 B)`, 종료 1. ③ 못 읽음(None): 읽기는 하되 결과에 `fr_id_seen: null`, 로그 `[suspect] fr_id를 못 읽었다 — 착지는 이름으로만 확인`. 4f의 `fr_id 0개` 의심과 같은 원인(dumpsys 모양)이다 |
| 쿠폰 버튼 | `쿠폰 없음` | 착지가 참이고, 상세에 `COUPON_BUTTONS`가 글자 칸과 설명 칸 둘 다 없다. 헤드라인이 없으니 4c의 "헤드라인에 쿠폰" 의심 대신 **상세 텍스트에 `쿠폰` 낱말이 있는데 버튼이 없으면** `[suspect]` | 결과에 `coupon: null, coupons: []`와 사유 `no_coupon_button`. 0장이라고만 쓰지 않는다 |
| 쿠폰 창 | 구간 N개 | 창 제목 `할인 쿠폰`이 떴다(`wait_for_marker`) | 제목이 안 뜨면 `[fail] 쿠폰 창이 안 열렸다`, 종료 1. 창은 떴는데 0장이면 4c와 같이 `coupon_unread` 증거와 `[suspect]`, 종료 1 |
| 상세 조건 | 정액 할인 없음 | `parse_detail_terms`가 브랜드 박스 안(`_brand_box`)을 본다. 박스 끝 표식(`DETAIL_BRAND_BOX_END`)이 트리에 있었는지 결과에 `box_seen`으로 남긴다 | 박스 표식이 없으면 "정액 없음"이 아니라 "박스 못 봄"이다. 로그 `[suspect] 브랜드 박스 경계를 못 찾았다` |
| 맞대기 | `어긋남 0` | 쿠폰함 파일이 있고, 그 파일에 이 브랜드가 대상인 배달 쿠폰이 1장 이상 있다 | 파일 없음: `맞댈 쿠폰함 없음 — 5y를 먼저`. 이 브랜드 쿠폰 0장: `쿠폰함에 이 브랜드 단일 배달 쿠폰이 없다 — 맞댈 것 없음`. 둘 다 `어긋남 0`을 찍지 않는다 |

## 4. 폭발 반경

`CHANGE-PROPAGATION.md`의 아홉 묶음 가운데 이 작업이 건드리는 자리는 **없다.** 표의 묶음은 배너, 확실성, 알림, 문구, 배포처럼 mono와 tracker 사이 경계다. 이 작업은 tracker 수집기 안에서 끝나고 원장, export, 배너, mono에 새 값을 보내지 않는다.

표에 없는 tracker 안의 묶음이 하나 있다. 이번 작업이 이것을 늘리지 않게 하는 것이 2-1의 목적이다.

| 자리 | 묶인 이유 | 이번 작업 |
| --- | --- | --- |
| 4c 결과 dict 모양(`sweep_brand_coupons_drv`) | 만드는 쪽 | 함수로 빼고 모양은 그대로 |
| `build_audit_records.build_yogiyo` | 그 dict를 원장 레코드로 바꾼다 | 안 고친다. 단건 결과도 이 빌더로 바꿔 맞댄다 |
| 5y `audit_yogiyo_today`(`_sheet`), `compare` | 그 dict와 쿠폰함을 맞댄다 | 안 고친다. 단건 명령이 같은 두 함수를 부른다 |
| 4f `yogiyo_links.DEEPLINK`, 별칭 표 | 같은 링크와 같은 이름 규칙 | 상수를 import한다. 별칭 표는 함수로 빼서 둘이 같이 쓴다 |
| `brands.yml` 요기요 링크 | 진입 주소의 유일한 출처 | 읽기만 한다. 쓰는 것은 여전히 4f와 4e |

- **헤드라인:** 단건 진입에는 목록 헤드라인이 없다. `build_yogiyo`는 조건도 쿠폰도 없을 때만 헤드라인을 쓴다(편의점처럼 상세에 조건이 없는 곳). 그런 브랜드는 단건 결과에서 레코드가 안 나올 수 있다. 맞대기에는 영향이 없다. 5y `compare`는 레코드의 `tiers`와 함께 쿠폰 창에서 본 쿠폰 전부(`_sheet`)를 쓰고, CU 같은 쿠폰만 든 브랜드는 `_sheet`로 맞는다. 상세 화면 위쪽의 `최대 N원 할인` 줄을 헤드라인으로 읽는 것은 실기 트리를 본 뒤 정한다(8절 3번, PR 리뷰 포인트).
- **원장:** 이 명령은 원장에 쓰지 않으므로 append-only를 건드릴 일이 없다. 다시 읽은 값을 원장에 넣고 싶어지면 별도 이슈로 낸다. 그때는 `ingest.py`를 거쳐 더 늦은 시각의 새 관측으로만 넣는다. 4c 결과를 덮어쓰지 않는다.
- **예약 수집:** 루틴에 붙이지 않는다(6절). `run_routine.py`, `check_routine.py`, `ROUTINE-SPEC.md` 단계 표는 이번에 안 고친다. 다만 4c 함수를 고치므로 구현 뒤 예약 전에 4c를 `collect_trial.ps1`로 돌린다(8절).
- **요기요 주소:** 쿠폰은 전국 공통이고 주소가 가르는 것은 아래쪽 매장 목록이다(연구 문서). 그래서 명령은 주소를 바꾸지 않는다. 브랜드 박스 경계(`_brand_box`)가 매장 목록을 막는다.

## 5. 5y 어긋남과 맞대기 (`--compare`)

1. `captures/yogiyo_couponbox_<날짜>.json`을 읽는다. 없으면 3절 문장으로 끝낸다.
2. 단건 결과를 `{브랜드: entry}`로 만들어 `audit_yogiyo_today`와 같은 방식(`build_yogiyo` + `_sheet`)으로 오퍼 꼴로 바꾼다. 같은 일을 두 번 쓰지 않도록 `audit_yogiyo_today`의 변환부를 `offers_from_audit_result(result, day)`로 빼고 둘이 같이 부른다.
3. `compare(쿠폰함 중 이 브랜드 것, 그 오퍼)`를 돌린다.
4. 4c 판독(`reports/audit-<날짜>.json`)에도 이 브랜드가 있으면 같은 `compare`를 돌려 두 결과를 나란히 찍고, 쿠폰함 쿠폰마다 셋 중 하나로 가른다.

| 4c | 단건 | 판정 문장 | 뜻 |
| --- | --- | --- | --- |
| 구간 없음 | 구간 있음 | `4c가 놓쳤다` | 4c 읽기 결함. 4c 쪽을 고친다 |
| 구간 없음 | 구간 없음 | `브랜드 화면에도 없다` | 쿠폰함 쿠폰이 브랜드 화면에서 내려갔거나 계정에만 준 쿠폰이다. 4c 결함이 아니다 |
| 구간 있음 | 구간 없음 | `다시 읽으니 사라졌다` | 4c 뒤에 쿠폰이 바뀌었다 |
| 4c에 브랜드 없음 | — | `4c 판독 없음 — 단건만 맞댔다` | 낮 실행 등 |

이 표가 이 명령의 쓸모다. 5y의 `[suspect]` 한 줄은 "4c가 놓쳤다"와 "쿠폰이 바뀌었다"를 가르지 못한다(ROUTINE-SPEC 5y 의심 신호 칸이 둘을 한 문장에 적는다). 이 명령이 그 둘을 가른다.

## 6. 결정: 5y에 자동으로 붙이지 않는다 (끝 조건 2)

이번 이슈에서는 5y가 어긋남을 낼 때 이 명령을 자동으로 부르지 않는다. 사람이 손으로 돌린다.

- **결과를 받는 쪽이 없다.** 다시 읽은 값은 원장도 판정기도 바꾸지 않는다. 자동으로 붙이면 로그 한 줄이 늘 뿐이고, 그 로그를 읽는 사람은 지금 5y 줄을 읽는 사람과 같다.
- **딥링크 화면이 목록 화면과 같다는 것이 안드로이드에서는 쿠폰 창 하나로만 확인됐다.** 상세 조건(`parse_detail_terms`)까지 같은지는 이 명령으로 처음 본다. 같다는 근거가 쌓이기 전에 판정에 넣으면 단건 결함이 5y 판정을 흔든다.
- **폰 시간.** 5y는 요기요 폰에 고정이고(devices.json) 00:01 회차는 4c 뒤에 바로 돈다. 어긋남이 많은 날(2026-10-01 다섯 곳) 브랜드마다 착지 대기 7초와 쿠폰 창이 붙는다.

붙일 조건은 후속 이슈로 낸다: 손 실행 다섯 번 이상에서 4c와 단건이 어긋남이 없는 브랜드의 구간을 똑같이 읽고, 5절 판정이 사람 확인과 맞으면 5y 끝에 `--reread`(기본 꺼짐)로 붙인다. 그때 판정기가 `4c가 놓쳤다`를 SUSPECT로, `브랜드 화면에도 없다`를 PASS로 내릴지를 정한다.

4c 낮은 읽기 재확인(이슈 할 일 3)도 같은 이유로 손 실행만 한다. 4c 재시도는 이미 브랜드 단위로 한 번 더 연다(ROUTINE-SPEC 단계 4 재시도). 요기요는 그 재시도가 주소 순회 전체라 비싸서(`full_audit` 주석, 주소 6곳 약 30분) 이 명령이 그 자리를 대신할 수 있다. 그러나 그것도 위 근거가 쌓인 뒤 후속 이슈에서 정한다.

## 7. 결론을 박는 테스트

폰 없이 도는 테스트다. 가짜 드라이버는 `tests/test_yogiyo_sweep_lost_brand.py`의 `FakeDrv` 꼴을 넓혀 쓴다(트리 목록, `open_url`, `screenshot`, `back` 기록).

| 테스트 | 박는 결론 |
| --- | --- |
| `test_sweep_and_single_read_same_entry` | 같은 상세 트리와 쿠폰 창 트리를 주면 순회(`sweep_brand_coupons_drv`)와 단건(`read_brand_detail_drv`를 부르는 명령 본체)이 같은 dict를 낸다(`screenshot_path`, `read_at`, `via`, `fr_id_link` 제외). 둘이 갈라지면 빨갛다 |
| `test_sweep_calls_read_brand_detail` | 순회가 추출한 함수를 부른다(monkeypatch로 셈). 누가 루프 안에 읽기를 다시 박으면 빨갛다 |
| `test_resolve_link_by_alias` | 대표명, `aliases`, `searchAliases`로 `fr_id`를 찾는다. 4f와 같은 함수를 쓴다 |
| `test_resolve_link_rejects_non_franchise` | `search?keyword=` 링크와 링크 없음은 종료 코드 2와 사유. 검색 화면을 브랜드 화면으로 읽지 않는다 |
| `test_landing_other_brand_does_not_read` | 착지 트리에 다른 브랜드 이름만 있으면 쿠폰 버튼을 누르지 않고(`back`/탭 기록 없음) 종료 1 |
| `test_landing_fr_id_mismatch_fails` | 이름은 맞고 `current_fr_id`가 다르면 종료 1 |
| `test_no_button_is_reason_not_zero` | 착지가 맞고 버튼이 없으면 결과에 `no_coupon_button` 사유가 있다. 사유 없는 빈 결과를 내지 않는다 |
| `test_compare_without_couponbox_says_unobserved` | 쿠폰함 파일이 없으면 출력에 `어긋남 0`이 없고 `맞댈 쿠폰함 없음`이 있다 |
| `test_compare_classifies_missed_vs_gone` | 5절 표 네 줄을 픽스처로 하나씩 |
| `test_does_not_write_ledger` | `--write`가 `captures/yogiyo_brand_<날짜>.json`만 만들고 `data/log.jsonl`, `reports/audit-*.json`을 건드리지 않는다(임시 ROOT에서 파일 목록 비교) |

기존 `tests/test_yogiyo_*.py`와 `tests/test_yogiyo_links.py`는 그대로 초록이어야 한다. 별칭 표를 뺀 뒤에도 4f 테스트가 같은 대상을 고르는지가 걸린다.

## 8. 실기 시험 (구현자, 수집 PC)

예약 시각을 피해 `scripts/collect_trial.ps1`로 돌린다. 인계 파일 `폰 시험:` 줄에 표시한다.

1. `python scripts/yogiyo_brand.py CU --compare` (미리보기). 11-08 어긋남 2건이 5절 표의 어느 줄로 가는지 적는다.
2. 어긋남이 없는 브랜드 둘(정액+정률 쿠폰이 있는 곳 하나, 쿠폰만 있는 곳 하나)을 같은 날 4c 판독과 맞대 구간이 같은지 본다. 같지 않으면 6절 근거가 없는 것이니 차이를 이슈 댓글에 적는다.
3. 딥링크 착지 상세 트리(`captures/_evidence`)를 하나 남겨 헤드라인 줄 모양을 기록한다(4절 "헤드라인").
4. 4c를 고쳤으므로 `python scripts/full_audit.py --platforms yogiyo`를 한 주소로 돌려 `브랜드 A · 만료 후보 B · 판독 실패 C · 캡처 D장`이 고치기 전 같은 날 숫자와 크게 다르지 않은지 본다. 숫자만 보지 않고 브랜드 두셋의 `coupons`를 연다.

## 9. 범위 밖

- 웹 브랜드 주소 조사(1절. 이미 결론이 있다).
- 5y, 판정기, 루틴에 붙이기(6절, 후속 이슈).
- 원장 반영.
- `brands.yml`에 요기요 링크가 없는 브랜드의 진입. 링크는 4f가 4c 순회에서 줍는다. 링크가 없는 브랜드는 명령이 종료 2로 알린다.
- `scripts/yogiyo_claim_probe.py` 정리. 새 명령이 그 일을 덮지만 지우는 것은 구현자가 쓰는 곳을 찾은 뒤 정한다.
