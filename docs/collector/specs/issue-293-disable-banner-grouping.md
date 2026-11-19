<!-- 원본: tracker docs/specs/issue-293-disable-banner-grouping.md — 여기서 고치지 않는다 -->
# 설계: 6단계 배너 제안이 묶지 않게 하는 스위치 (이슈 #293)

- 상태: 설계 (구현 전). 2026-11-13
- 영역: **collect.** 고치는 코드(`scripts/banner_ce.py`, `scripts/banner_routine.py`)는 폰 없이 테스트로 끝나지만, 예약 6단계가 부르는 코드라서 다음 예약 전에 6단계만 실제로 돌려 봐야 한다(`AGENTS.md` "수집 코드를 바꿨으면", 사용자 2026-10-15). 6단계는 쿠팡이츠 허브를 폰으로 읽는다.
- 읽은 것: 이슈 입력, `AGENTS.md`, `docs/workflow/LOCAL-RULES.md`, `mono/docs/CHANGE-PROPAGATION.md` 3번, `scripts/banner_ce.py` 전체, `scripts/banner_ops.py`(`group_problem`, `group_rule_problem`, `_touched_groups`, `GROUP_SHARED`), `scripts/banner_model.py`(`CE_UPDATE_KEYS`, `BAEMIN_UPDATE_KEYS`), `scripts/banner_routine.py`(`as_ce_banner`, 쿠팡이츠 제안부와 op 조립부), `docs/setup/ROUTINE-SPEC.md` 3s, 6, 7단계, `docs/setup/CROSS-CHECK-VERDICTS.md`, 테스트 중 `group`을 단언하는 곳(6절).
- **읽지 못한 것:** 콘솔 `beggars-ops`의 `ops_apply.py`. 별도 저장소라 이 체크아웃에 없다. `open_day_group` 머리말이 "콘솔(`ops_apply.open_group_id`)과 같은 꼴"이라고 적는다. 콘솔이 승인할 때 `group`을 스스로 붙이는지는 모른다(4절 위험 1).
- 행 번호는 쓰지 않는다. 함수 이름과 출력 문구로 찾는다.

## 1. 묶는 자리는 셋, 배민은 없다

이슈가 "설계에서 확인한다"로 남긴 배민과 쿠팡이츠 주간 배너를 확인했다.

| 자리 | 함수 | `group` 값 | 이번 스위치 |
| --- | --- | --- | --- |
| 쿠팡이츠 선착순 새 제안 | `propose_ce_ops`의 `group_first_come` 루프 | `open_day_group(today)` = `coupangeats-open-<날짜>` | 끈다 |
| 쿠팡이츠 선착순 이어쓰기 | `carry_over_open_banners` | 같음. 전날 배너의 `group`을 `base`로 복사한 뒤 덮는다 | 끈다. **복사된 전날 값도 지운다** |
| 쿠팡이츠 주간 행사(`coupangeats-weekly-*`) | `ce_event_banners` (`as_ce_banner`가 부름) | `coupangeats-weekly-<날짜>`. 한 장뿐이면 이미 뗀다 | 끈다 |
| 배민 핫딜, 배짱, 요기요 행사 | `as_banner` 등 | **안 단다.** `scripts/` 전체에서 `"group"` 문자열 키를 쓰는 곳은 위 셋과 검증 함수뿐이다. `BAEMIN_UPDATE_KEYS`의 `group`은 사람이 적은 값을 덮는 목록일 뿐이다 | 손대지 않는다 |

묶음에 딸린 나머지 자리와 처리:

| 자리 | 하는 일 | 끈 상태 |
| --- | --- | --- |
| `group_first_come` | 시각별로 묶고 4곳씩 자르고 `11시-2` 번호를 붙인다 | 시각별 나눔과 5천원 거르기만 쓰고 자르지 않는다(2-1) |
| `unique_label` | 같은 꼬리표에 번호를 붙인다 | 부르지 않는다. id가 브랜드로 이미 유일하다(2-1) |
| `unify_group_notify` | 같은 `group`의 `notify`를 맞춘다 | 그대로 부른다. `group` 단 add가 없으면 아무것도 안 한다 |
| `group_url` | 오늘 살아 있는 같은 묶음의 url을 따른다 | 그대로 둔다(2-4) |
| `banner_ops.group_problem`, `group_rule_problem` | 콘솔에 올리기 전 묶음 규칙 검사 | 그대로 둔다. 이미 떠 있는 옛 묶음은 계속 검사해야 한다 |

## 2. 안

`scripts/banner_ce.py` 맨 위 상수 구역에 스위치 하나를 둔다.

```python
# 배너 묶기(group). 2026-11-14 사용자 결정으로 끈다: "배너 묶기 자체를 비활성화하자. 안 쓴다."
# 켜면 2026-11-13까지의 동작 그대로다. 묶는 코드는 지우지 않는다(이슈 #293).
BANNER_GROUPING = False
```

**함수는 호출 시점에 모듈 전역을 읽는다.** `banner_routine.py`가 `from scripts.banner_ce import BANNER_GROUPING`으로 값을 복사해 쓰면 테스트의 `monkeypatch.setattr(banner_ce, "BANNER_GROUPING", True)`가 그쪽에 안 닿는다. `banner_routine.py`에서 쓸 때는 `banner_ce.BANNER_GROUPING`으로 읽거나 `banner_ce`의 함수(`ce_update_keys()`, 2-3)를 부른다. 재수출 목록에 이 상수를 넣지 않는다.

### 2-1. 선착순 새 제안 (`propose_ce_ops`)

`group_first_come(opens, max_brands=FIRST_COME_MAX_BRANDS)`에 인자 하나를 더한다. `None`이면 자르지 않는다. 그러면 한 시각, 한 릴레이 여부마다 꼬리표 하나(`11시`, `11시-릴레이`, `선착순`)에 카드 전부가 금액 큰 순으로 온다. 5천원 거르기와 `skipped`는 그대로다. 켠 상태의 호출은 인자를 안 넘겨 지금과 같다.

끈 상태의 루프:

- 부르는 쪽: `group_first_come(opens, max_brands=None)`.
- `unique_label`을 부르지 않는다. 꼬리표는 시각 꼬리표 그대로이고 id는 `open_member_id(today, label, brand)` = `coupangeats-open-<날짜>-11시-<브랜드>`다. 같은 날 같은 브랜드는 한 장뿐이다(`best_by_brand`). 이어쓴 브랜드는 `opens`에서 빠진다. 오늘 이미 떠 있는 브랜드는 `shown`에서 빠진다. 그래서 id가 안 겹친다. 겹치지 않는다는 것은 테스트로 박는다(6절 `test_off_ids_unique_without_numbers`).
- `group` 칸을 넣지 않는다.
- 와우 전용 표시(`membership: coupangEats`)는 **브랜드마다** 정한다: `not d.get("relay")`. 켠 상태는 묶음에 릴레이가 섞이면 전원에서 뺐다. 묶음이 없으니 섞일 일이 없다. 끈 상태가 더 정확하다.
- `priority`는 하루 전체에서 하나씩 늘린다. 순서는 `group_first_come`이 내는 순서 그대로(시각 오름차순, 릴레이 여부, 금액 큰 순, 이름)이고 6부터 시작한다. 켠 상태에서 묶음 안 순서를 지키던 이유(CHANGE-PROPAGATION 3번 "순서 주의")가 낱장 사이 순서로 옮겨 온다. 같은 값을 주면 id 알파벳순이 되어 금액 큰 순서가 뒤집힌다.
- `why`는 `선착순인데 배너에 없다 (11시)`와 5천원 꼬리를 그대로 쓴다. 같은 시각 브랜드가 같은 사유 문장을 공유한다.

### 2-2. 이어쓰기 (`carry_over_open_banners`)

이슈: "전날 묶음을 되올릴 때는 브랜드마다 한 장으로 나누되 `group`은 달지 않는다."

- 판정(전날 배너의 브랜드 집합이 오늘 같은 시각에 다 열린다)은 바꾸지 않는다.
- 끈 상태에서는 `base["group"] = open_day_group(today)` 대신 `base.pop("group", None)`을 한다. **덮지 않고 지우는 이유:** `base`는 전날 배너의 칸을 통째로 복사한다(`startsAt`, `brands` 등 몇 칸만 뺀다). 덮는 줄만 건너뛰면 전날 `group` 값(`coupangeats-open-<어제>`)이 그대로 오늘 배너에 실린다. 이 실패는 "group을 안 달았다"는 코드 읽기로는 안 보이므로 테스트로 박는다(6절 `test_off_carry_drops_yesterday_group`).
- 끈 상태의 id 꼬리표는 전날 id에서 꺼낸 것(`11시-2-청년피자`)을 쓰지 않고 시각 꼬리표로 다시 만든다: `first_come_label(hour, relay)`. 이 함수는 `group_first_come`의 꼬리표 식(`f"{hour}시"`, `선착순`, `-릴레이`)을 빼낸 것이고 둘이 같이 쓴다. 그래야 "11시-2 같은 번호는 없다"가 이어쓴 배너에도 선다. 릴레이 여부는 오늘 관측(`pick.get("relay")`)에서 읽는다.
- 여러 브랜드를 한 장에 실은 옛 모양(`brands` 배열)은 지금처럼 브랜드마다 나눈다. `minOrder`를 빼고 `priority`를 `+i`로 늘리는 것도 그대로다.
- `notify`는 지금처럼 브랜드마다 전날 값을 잇는다. 묶음이 없으니 맞출 상대가 없다.

### 2-3. 주간 행사 (`ce_event_banners`, op 조립부)

- 끈 상태에서는 `group` 칸을 넣지 않는다. id는 `coupangeats-weekly-<날짜>-<브랜드>` 그대로다(지역 변수 이름 `group`은 id 머리로만 쓰도록 이름을 `head`로 바꾼다).
- **이미 떠 있는 묶음 배너를 건드리지 않는다.** `banner_routine.py`의 op 조립부와 미리보기 출력은 `CE_UPDATE_KEYS`로 지금 배너와 원하는 배너를 견준다. 끈 날 00:01 전에 묶여 올라간 주간 배너가 살아 있으면 `group: 'coupangeats-weekly-…' -> None`이 `set` op로 나간다. 이 op는 `auto: true`라 승인 없이 반영될 수 있고 묶음의 일부만 풀린다. 그래서 `banner_ce.ce_update_keys()`를 두고 두 자리(op 조립, 미리보기 출력)가 그것을 부른다. 끈 상태에서는 `group`을 뺀 목록을 낸다. `CE_UPDATE_KEYS` 상수 자체는 그대로 둔다(`test_ce_update_keys_cover_everything_as_ce_banner_computes`가 지키는 대응).

### 2-4. 링크

`group_url`은 두 모드에서 그대로 부른다. 오늘 살아 있는 같은 묶음이 없으면 `None`이고 공유 링크, 딥링크 순으로 떨어진다. 끈 첫날에 옛 묶음이 떠 있으면 그 url을 따른다. 옛 묶음 쪽 검사(`group_rule_problem`)는 `group`을 단 배너만 보므로 낱장 url이 무엇이든 걸리지 않는다. 그래도 같은 날 같은 허브에 링크가 둘이면 사람이 헷갈리므로 그날만은 옛 묶음 url을 따르는 지금 동작이 낫다.

### 2-5. 5천원 미만 거르기 (`FIRST_COME_MIN_AMOUNT`): 유지하고 사용자에게 묻는다

이슈 기본값대로 **유지한다.** 끈 상태에서도 5천원 미만은 배너로 안 올리고 `why` 꼬리에 이름만 남긴다.

다만 사용자에게 물을 근거가 있다. 이 규칙은 "하루치 9곳을 한 장에 묶으니 읽을 수 없었다"(2026-09-19)에서 나왔다. 묶음이 없으면 그 이유는 사라진다. 반대로 거르면 잃는 것이 있다. 5a는 선착순 오픈 쿠폰을 원장에 넣지 않는다("선착순 오픈(…) 쿠폰이다. 원장이 아니라 배너로 간다", ROUTINE-SPEC 5a). 그러니 5천원 미만 선착순은 서비스 어디에도 안 뜬다. 남는 이유는 화면 길이 하나다. 낱장이 늘면 배너 줄이 길어진다.

인계 댓글에서 "5천원 미만도 낱장으로 올릴까"를 사용자에게 묻는다. 답이 바뀌면 상수만 고친다(`FIRST_COME_MIN_AMOUNT = 0`). 이번 PR에서 고치지 않는다.

**결정(이후):** 사용자가 2026-11-14에 0으로 정했다(PR #297, "묶지 않으니 금액이 작아도 낱장으로 제안한다"). 2026-11-18 #358에서 그 값을 유지하기로 했다. 값은 `tests/test_banner_grouping_switch.py`가 단언한다.

## 3. "없다 / 0 / 통과"를 내는 자리와 양성 신호

| 자리 | 내는 말 | 그 말을 해도 되는 양성 신호 | 신호가 없을 때 |
| --- | --- | --- | --- |
| 6단계 로그 | "묶지 않았다" | 쿠팡이츠 제안부 끝에 한 줄: `  배너 묶기: 끔(BANNER_GROUPING) — 선착순 새 제안 N장(브랜드 N곳), 이어쓰기 M장, group 단 add K장`. N, M, K는 문자열이 아니라 **방금 만든 op 목록에서 센다.** 스위치 상태도 상수에서 읽어 찍는다 | 끈 상태에서 K>0이면 같은 줄 끝에 `[suspect] 묶지 않기로 했는데 group이 달렸다: <id들>`. 이 줄이 없으면 쿠팡이츠 제안부가 안 돈 것이다(허브를 못 읽음, 위의 `쿠팡이츠를 못 읽었다` 줄과 같이 본다) |
| 같은 줄 | `선착순 새 제안 0장` | 같은 실행의 `선착순인데 배너에 없다` 대상(`opens`)이 0이었다는 것. 줄에 `읽은 선착순 X곳, 이미 떠 있음 Y곳, 5천원 미만 Z곳, 건너뛰기 W곳`을 같이 찍는다 | X가 0이면 "새로 올릴 것 없음"이 아니라 "선착순을 못 읽었다"일 수 있다. 0을 찍을 때 X를 같이 보이게 하는 것이 목적이다 |
| 주간 행사 미리보기 | `바뀐 것 없음 <id>` | 끈 상태에서 `group`이 비교에서 빠졌다는 것이 줄에 보여야 한다. 미리보기 머리에 `견주는 칸: …`을 한 번 찍는다 | 없으면 사람이 "group이 다른데 왜 같다고 하나"를 못 가린다 |
| `CROSS-CHECK-VERDICTS.md` | "고칠 곳 없음" | `묶`, `group`, `group_` 세 낱말로 문서 전체를 찾아 맞는 줄이 없었다(2026-11-13). 이 문서는 소실 가드, 매장 혜택, 허브 대 쿠폰함 판정만 다룬다 | 구현자가 그 사이에 문서가 바뀌었으면 다시 찾는다 |

## 4. 폭발 반경

`CHANGE-PROPAGATION.md` **3번 "묶음 배너 (group)"** 이 이 작업의 묶음이다.

| 자리 | 이번 작업 | 이유 |
| --- | --- | --- |
| 만드는 쪽 tracker `propose_ce_ops` 등 | 고친다 | 이 이슈 |
| 접는 쪽 mono `BannerCatalog.active()` | **안 고친다** | mono 이슈가 따로 끈다(이슈 "순서"). `group` 없는 배너는 지금도 낱장으로 나온다. 주간 행사가 한 브랜드뿐인 날 `ce_event_banners`가 이미 `group`을 떼고 있었고 그날도 화면이 섰다. 그래서 tracker가 먼저 병합돼도 깨지지 않는다 |
| 안 접는 쪽 `activeMembers()` | 안 고친다 | 낱장은 원래 구성원 하나짜리처럼 오퍼가 선다 |
| 그리는 쪽 `web/src/EventBanner.jsx` `brands` | 안 고친다 | 낱장에는 `brands`가 없다. 지금 단독 배너와 같은 길이다 |

3번 표의 "끊기면 무엇이 보이나"(대표 금액 하나만 뜬다)는 접는 쪽 문제라 낱장에서는 안 생긴다. "순서 주의"는 2-1의 `priority`로 옮겨 온다.

표 밖에서 걸리는 것:

1. **위험: 콘솔이 `group`을 스스로 붙이는가.** `open_day_group` 머리말이 콘솔 `ops_apply.open_group_id`와 꼴을 맞춘다고 적는다. 콘솔이 승인할 때 `coupangeats-open-*` id에서 묶음을 계산해 붙인다면 이 PR이 `group`을 안 보내도 운영에는 묶음이 생긴다. 여기서 읽을 수 없다. PR 리뷰 포인트로 올리고 병합 뒤 첫 6단계 승인 결과를 운영 `banners.yml`에서 본다(7절 3번).
2. **판정기와 7단계.** `check_routine.ORDER_FIELDS`가 `group`을 순서 칸으로 PASS에 둔다. 끈 뒤 옛 묶음과 새 낱장이 섞여도 7단계 어긋남이 `group` 줄이면 PASS다. 고치지 않는다.
3. **이 PR에 넣지 않는 것:** CHANGE-PROPAGATION 3번 표의 "만드는 쪽" 칸 설명(`브랜드마다 한 장, 같은 group`)은 mono 문서다. 이 저장소에서 고치지 않고(mono는 읽기용) mono 이슈 쪽에서 3번 줄을 고치거나 지운다. 후속 조치로 남긴다.

**원장:** `data/log.jsonl`을 건드리지 않는다. 배너 제안(op)만 바뀐다. append-only와 상관없다.

## 5. 문서

| 문서 | 고칠 곳 |
| --- | --- |
| `docs/setup/ROUTINE-SPEC.md` 단계 6 표 | 줄 하나 더한다: `배너 묶기 | 끔(2026-11-14 사용자, BANNER_GROUPING). 쿠팡이츠 선착순, 이어쓰기, 주간 행사 모두 브랜드마다 한 장이고 group이 없다. 5천원 미만 선착순은 그대로 뺀다. 이미 떠 있는 묶음은 건드리지 않는다. 확인 줄: 배너 묶기: 끔 …` |
| 같은 표 "쿠팡이츠 행사 금액" 줄 | `extra`의 브랜드 순서대로 `최대 7,000/5,000원`처럼 나열한다는 설명은 2026-09-29부터 이미 거짓이다(브랜드마다 한 장). 낱장 금액(`{won: [null, 상한], random: true}`)으로 고친다. 묶음을 말한 곳이라 이번에 같이 고친다 |
| 같은 표 "여러 브랜드 한 장" 줄 | 사람이 쓴 옛 배너를 읽는 규칙(`brands_of`)이라 남긴다. 기계는 `brands`를 안 만든다는 한 문장만 더한다 |
| `ROUTINE-SPEC.md` 3s "쓰는 곳" | "그날 묶음이 이미 다른 url로 떠 있으면 묶음 규칙(링크 같음) 때문에 그 url을 따른다"를 "그날 묶음 배너(묶기를 끄기 전에 올라간 것)가 떠 있으면 …"으로 바꾼다 |
| `docs/setup/CROSS-CHECK-VERDICTS.md` | 고칠 곳 없음(3절 마지막 줄의 근거) |

## 6. 결론을 박는 테스트

새 파일 `tests/test_banner_grouping_switch.py`. 폰 없이 돈다. 스위치는 `monkeypatch.setattr(banner_ce, "BANNER_GROUPING", …)`로 고른다.

| 테스트 | 박는 결론 |
| --- | --- |
| `test_default_is_off` | `banner_ce.BANNER_GROUPING is False`. 누가 True로 되돌리면 빨갛다 |
| `test_off_first_come_one_add_per_brand_no_group` | 한 시각에 6곳(5천원 이상), 다른 시각에 1곳을 주면 add가 정확히 7장이고 어느 것에도 `group` 키가 없다 |
| `test_off_ids_unique_without_numbers` | 같은 날 id가 전부 다르고, `re.search(r"\d+시-\d+", id)`에 걸리는 id가 없다. 전부 `open_member_id` 꼴(`coupangeats-open-<날짜>-<시각>-<브랜드>`)이다 |
| `test_off_keeps_min_amount_filter` | 4,000원 브랜드는 add가 없고 같은 시각 add의 `why`에 이름이 있다(2-5 유지) |
| `test_off_priority_follows_hour_then_amount` | 11시 8천, 11시 6천, 17시 7천이면 priority가 6, 7, 8이다 |
| `test_off_membership_per_brand` | 같은 시각에 릴레이 하나와 비릴레이 하나면 비릴레이만 `membership: coupangEats`다 |
| `test_off_carry_splits_and_drops_yesterday_group` | 전날 `group: coupangeats-open-<어제>`인 배너 둘(`11시-청년피자`, `11시-2-BHC`)이 오늘도 11시에 열리면 add 둘, `group` 키 없음, id에 `-2`가 없다 |
| `test_off_carry_splits_old_brands_array` | 전날 `brands: [a, b]` 한 장은 add 둘이고 `group`이 없다 |
| `test_off_weekly_has_no_group` | `ce_event_banners`가 두 브랜드에 두 장을 내고 `group`이 없다 |
| `test_off_live_grouped_weekly_not_ungrouped` | 오늘 `group`을 단 주간 배너가 떠 있고 원하는 배너는 `group`이 없을 때, op 조립부(`ce_update_keys()`로 견주는 자리)가 `group` 칸을 담은 `set`을 내지 않는다 |
| `test_off_log_line_counts_from_ops` | 6단계 쿠팡이츠 제안부의 확인 줄이 `배너 묶기: 끔`과 실제 add 수를 찍는다(capsys). 끈 상태에서 `group` 단 add를 일부러 섞어 넣으면 `[suspect]`가 붙는다 |
| `test_on_matches_old_behavior` | `BANNER_GROUPING=True`일 때 6곳이 4곳과 2곳 두 덩이(`11시`, `11시-2`)이고 모두 `group == coupangeats-open-<날짜>`다. 주간 행사도 `group`이 있다 |

**기존 테스트:** `group`을 단언하는 테스트는 켠 상태의 회귀 시험으로 남긴다. 바꾸는 것은 스위치를 켜는 픽스처뿐이고 단언은 손대지 않는다. 이슈 요구 "켜면 지금 동작 그대로"를 이 테스트들이 지킨다.

- `tests/test_banner_ops.py`의 `coupangeats-open-20260918`, `coupangeats-open-20260924` 단언 다섯 곳
- `tests/test_banner_ce_targeted_skip.py`의 `coupangeats-open-20261103` 단언
- `tests/test_banner_routine.py`의 `coupangeats-weekly-20260911` 단언
- `tests/test_banner_proposals.py`(`group_first_come` 자르기). 이 파일은 함수를 직접 부르므로 기본 인자에서 그대로 초록이어야 한다

스위치를 켜는 픽스처는 테스트 함수 단위로 단다(`@pytest.mark.usefixtures("grouping_on")`, `tests/conftest.py`에 둔다). 파일 전체 autouse로 걸면 같은 파일의 묶음과 상관없는 테스트까지 켠 상태로만 돌아 끈 상태가 안 시험된다.

`python -m pytest`가 전부 초록이어야 하고, HARNESS §11 점검의 마지막 줄(별칭표 없이)까지 돌린다.

## 7. 실기 시험 (구현자, 수집 PC)

예약 시각을 피한다. 인계 파일의 `폰 시험:` 줄에 표시한다.

1. `scripts/collect_trial.ps1 -Command "python scripts/banner_routine.py --skip-extend" -Serials <쿠팡이츠 폰>`. `--propose`를 붙이면 서버에 제안서를 올리므로 시험은 **올리지 않는 미리보기**(`--propose`, `--apply` 없이)로 한다. 로그에서 `배너 묶기: 끔` 줄과 N, M, K를 본다. K가 0인 것만 보지 않는다. 미리보기 출력의 add를 몇 장 열어 `group` 칸이 없는지, id에 `-2`가 없는지 본다.
2. 같은 날 선착순 브랜드 수(허브에서 읽은 `fixed` 중 `opens_at`이 있는 것, 5천원 이상, 건너뛰기 제외, 이미 떠 있는 것 제외)와 새 add 수가 같은지 맞댄다.
3. 병합 뒤 첫 승인 반영 후 운영 `banners.yml`(또는 운영 API 배너 목록)에서 오늘 `coupangeats-open-*` 배너에 `group`이 없는지 본다. 있으면 4절 위험 1(콘솔이 붙인다)이다. 그때는 이슈 댓글에 적고 콘솔 이슈를 따로 낸다.

## 8. 범위 밖

- mono 접어 그리기 끄기(mono 이슈).
- 묶음 코드 삭제(요구사항: 지우지 않는다).
- `FIRST_COME_MIN_AMOUNT` 값 변경(2-5. 사용자 답을 받은 뒤 상수만 고친다).
- 이미 올라간 묶음 배너 풀기. 그날 끝나면 사라진다.
- `CHANGE-PROPAGATION.md` 3번 줄 고치기(mono 문서. 4절 3번).
