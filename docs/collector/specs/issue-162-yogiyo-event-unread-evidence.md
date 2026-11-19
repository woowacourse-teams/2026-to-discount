<!-- 원본: tracker docs/specs/issue-162-yogiyo-event-unread-evidence.md — 여기서 고치지 않는다 -->
# 이슈 #162: 요기요 캐러셀과 행사 페이지를 못 읽는 일이 간헐적으로 난다

영역: `collect`. 고칠 자리(`scripts/yogiyo_events.py`, `capture/yogiyo_event.py`)는 6단계 배너 제안이 폰으로 요기요 앱을 여는 코드다. 원인을 가리려면 실패 순간의 화면이 있어야 하고, `AGENTS.md`의 "수집 코드를 바꿨으면 실제 수집으로 시험한다"에 걸린다. 판정기(`scripts/check_routine.py`) 한 자리만 폰이 필요 없다.

## 1. 문제

### 1-1. 이슈가 준 것

- 11-04 15:55 회차 6단계에서 세 줄:
  - `요기요 캐러셀 훑기 실패 — 목록만 본다 (capture_failed: yogiyo 할인/혜택 탭을 못 찾았다)`
  - 행사 페이지 `gbjbgt3`, `4wakv4y` 두 곳이 `못 읽었다 — 그대로 둔다(capture_failed: yogiyo 행사 페이지가 안 열렸다 …)`
- 로그에서 센 `capture_failed: yogiyo` 줄: 11-01 2건, 11-02 0건, 11-03 1건, 11-04 3건.
- 같은 날 5y(요기요 쿠폰함)는 PASS, 보유 쿠폰 60장.

이 세션은 클라우드 러너라 로그, 화면, 폰을 못 봤다. 저장소에 `logs/`, `reports/`의 11-01~04 파일이 없다(`Glob` 확인). 아래 1-2는 코드와 `data/yogiyo_events.json`에서 읽은 것만이다.

### 1-2. 코드와 목록에서 확인한 것

1. **실패 화면이 남지 않는다.** 두 실패 모두 `RuntimeError` 글자만 던진다.
   - `discover`(`scripts/yogiyo_events.py:308-310`): `_back_to` 뒤 `drv.nodes()`에서 글자 `할인/혜택`을 한 번 찾고 없으면 바로 실패.
   - `open_event_drv`(`capture/yogiyo_event.py:86-95`): 30초 동안 `CAP` 또는 `HEADLINE`에 맞는 줄을 찾고 없으면 실패.
   - 같은 저장소의 `landing_check`(`capture/common.py:992-1090`)는 실패 때 `save_evidence`로 뷰 트리와 스크린샷을 남기고 "앱 밖 / 앱 안, 앵커 없음 · 글자 N개 / 오류 문구"로 갈라 찍는다. 요기요 행사 쪽만 이 길을 안 쓴다. 그래서 이슈의 "모르는 것"(앱 구조, 로딩, 폰 상태)을 지금 로그로는 못 가른다.
2. **"안 열렸다"가 두 가지를 한 글자로 낸다.** 열린 판정의 양성 신호가 헤드라인 꼴 두 가지(`최대 N원 할인`, `누구나 N원 할인`)뿐이다. 페이지가 앱 안에 다 그려졌는데 헤드라인 꼴만 다르면(브랜드 행사가 아닌 결제수단 행사, 홍보 판) 30초를 기다린 뒤 "안 열렸다"가 된다. 사용자 댓글(행사 종류가 결제, 결제방식, 홍보로 다양함)이 바로 이 자리다.
3. **두 링크는 닫힌 행사가 아니다(목록 기준).** `gbjbgt3`, `4wakv4y` 둘 다 `ends: 2026-11-08`이다. `ends`는 `read_all`이 페이지를 **연 뒤에만** 쓴다(`scripts/yogiyo_events.py:344-348`). 두 링크는 이전 회차에 한 번 이상 열렸고 기간이 11-08까지라고 읽혔다. 15:55 실패는 링크 자체보다 그 회차의 폰이나 앱 상태 쪽일 가능성이 크다. **확인하지 않은 추론이다.**
4. **캐러셀 실패가 뒤 페이지 열기를 오염시킬 수 있다.** `discover`가 실패하면 앱은 어느 화면에 멈췄는지 모르는 상태다. 곧바로 `read_all`이 같은 폰에서 `open_url`을 부른다. `clear_before_entry`는 요기요가 앞일 때 가드 표만 돌린다. 같은 회차에 세 실패가 몰린 것과 맞는 그림이다. **확인하지 않은 가설이다.** 3시간 간격(`DISCOVER_EVERY_H`)도 실패하면 `discovered_at`을 안 쓰므로 실패 뒤엔 회차마다 다시 돈다(`:324-330`).
5. **`4wakv4y`는 브랜드를 한 번도 못 읽었다.** 그 행에 `title`, `brand`가 없다. 캐러셀로 들어온 행은 `brand`가 있어야 주소를 받으므로(`_visit` `:220`) 사람이 `add`로 넣은 것으로 읽힌다. `read_all`은 연 뒤 브랜드를 읽으면 채우는데 안 채워졌다. 이 페이지는 `BRAND_LINE`(헤드라인 앞 "브랜드 배달/포장") 꼴이 아니다. 2번의 "꼴이 다른 페이지" 후보다.
6. **판정기가 이 실패를 못 본다.** `check_routine` 6단계(`scripts/check_routine.py:331-349`)는 `reload:`, `제안서 올림`, `[승인 필요]`, `사람이 볼 것`만 본다. 요기요 줄이 셋 다 실패여도 6단계는 **PASS**다. 이슈의 건수를 사람이 로그를 직접 grep해 셌다. `AGENTS.md` "먼저 알 것"의 "통과가 관측인지 미관측인지 구분되지 않는다"가 그대로 났다.
7. **닫힌 행사를 정리하는 길이 반만 있다.** 읽은 `ends`가 지나면 `read_all`이 다시 안 연다(`:341`). 한 번도 못 연 링크, 기간을 읽기 전에 닫힌 링크는 `ends`가 안 생겨 영원히 회차마다 30초씩 열어 본다. 목록에서 빼는 명령도 없다(`add`만 있음).

### 1-3. #100과의 관계

`docs/`에 #100 설계가 없다. 이슈 입력의 제목("요기요, 땡겨요 마감 표시 폰 읽기")으로만 판단한다. #100은 열린 화면의 선착순 **마감 표시를 읽는** 일이다(`docs/specs/issue-37-first-come-structure-check.md` §4 계열). #162는 화면에 **닿지 못하는** 일이다. 고칠 함수가 겹치지 않는다(#100은 쿠폰함, 행사 판독, #162는 `discover`, `open_event_drv`의 기다림과 실패). 다만 둘 다 `capture/yogiyo_event.py`를 만질 수 있어, 먼저 병합되는 쪽 뒤에 다른 쪽이 rebase한다. **#100 본문은 읽지 않았다.**

### 1-4. 사용자 댓글에 대한 판단

댓글: 요기요 행사는 종류가 다양해 읽기 힘드니 개략만 읽어 보고하는 정도로 낮추자.

- 받는 것: **꼴이 다른 페이지를 "안 열렸다"로 내지 않고 "열렸다, 개략은 이렇다"로 낸다**(§3-2). 배너 금액을 정하지 않으니 틀린 값이 나갈 길이 없다.
- 그대로 두는 것: **브랜드 행사의 금액 판독은 낮추지 않는다.** 지금 판독(헤드라인 = 즉시할인 + 가장 큰 쿠폰일 때만 제안)은 이미 검산이 있는 보수적 규칙이다. 11-04 실패는 판독이 아니라 화면에 닿는 쪽(탭 못 찾음, 30초 시간 끝)이라 판독을 낮춰도 세 줄 다 그대로 난다.

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에서 이 자리는 2번 묶음(배너 모양, 만드는 쪽 `scripts/banner_routine.py`)에 걸친다. 이번 변경은 **배너 한 장의 칸을 바꾸지 않는다.** 만드는 op(`add`, `set`)와 배너 칸(`id`, `brand`, `amount`, `minOrder`, `startsAt`, `endsAt`, `url`, `priority`)은 그대로다. 그래서 같은 묶음의 `ops_apply.py`, `BannerCatalog.java`, `EventBanner.jsx`는 넣지 않는다. 바뀌는 것은 로그 줄, 판정기, 상태 파일 `data/yogiyo_events.json`의 칸이다. 나머지 묶음(1, 3~9)에는 요기요 행사 자리가 없다(`Grep` `요기요|yogiyo|배너|행사`).

tracker 안의 자리:

| 자리 | 지금 | 이번에 |
|---|---|---|
| `capture/yogiyo_event.py` `open_event_drv` | 헤드라인 꼴이 없으면 30초 뒤 "안 열렸다" | 끝날 때 화면을 갈라 `EventUnread`로 던진다. 꼴이 다른 페이지는 실패 대신 개략을 돌려준다(§3-1, §3-2) |
| `capture/yogiyo_event.py` 새 순수 함수 `classify_screen(xml, package)` | 없음 | 뷰 트리만 보고 화면 종류를 정한다(§3-1) |
| `scripts/yogiyo_events.py` `discover` | 탭을 한 번 찾고 실패 | 증거를 남기고 한 번 다시 띄운 뒤 다시 찾는다(§3-3) |
| `scripts/yogiyo_events.py` `read_all` | 실패를 글자로 쌓음 | 실패 종류와 증거 경로를 쌓고, 연속 실패를 행에 센다(§3-4) |
| `scripts/yogiyo_events.py` `banner_ops` | `못 읽었다 — 그대로 둔다(…)` | 종류를 붙인 고정 꼴 줄. 개략 줄 추가(§3-5) |
| `scripts/yogiyo_events.py` `main` | `add`만 | `retire <주소>` 추가(§3-4) |
| `scripts/banner_routine.py:780-799` | 캐러셀 실패 뒤 곧바로 `read_all` | 캐러셀이 실패했으면 요기요를 끄고 `read_all`을 시작한다(§3-3) |
| `scripts/check_routine.py` 6단계 | 요기요 줄을 안 봄 | 요기요 미판독 줄이 있으면 SUSPECT(§3-6) |
| `data/yogiyo_events.json` | `url`, `added`, `title`, `brand`, `ends` | `last_ok`, `fail_days`, `retired` 칸 추가. 옛 행은 칸이 없어도 그대로 읽힌다 |
| `docs/setup/ROUTINE-SPEC.md` 6단계 요기요 문단(386-393행) | 실패 신호 없음 | 새 줄의 뜻과 SUSPECT 판정 한 문단 |
| `docs/setup/COLLECTION-INCIDENTS.md` | 요기요 행사 항목 없음 | 증상 → `captures/_evidence/yogiyo-event-*` 확인 → 조치 한 항목 |

넣지 않는 것:

- **`landing_check`로 바꾸어 끼우기.** 그 함수는 serial을 받고 앱을 다시 띄우는 `launch`를 요구한다. 행사 페이지는 `drv.open_url`로 열고 다시 띄우면 홈으로 떨어진다. 화면 가르기만 같은 꼴로 따로 둔다. 둘을 합치는 일은 하지 않는다.
- **`할인/혜택` 탭을 좌표나 아이콘으로 찾기.** 구조로 짚는 것이 맞지만(먼저 알 것 2번) 지금은 실패 화면이 없어 탭이 이름을 바꿨는지, 화면이 아예 다른지 모른다. §3-3의 증거가 쌓인 뒤 결정한다(§8).
- **배너 칸, 승인 흐름.** 요기요 행사 제안은 그대로 `auto: false`다.

## 3. 설계

### 3-1. 화면 가르기는 순수 함수 하나

`capture/yogiyo_event.py`에 `classify_screen(xml: str, package: str) -> tuple[str, str]`을 둔다. 돌려주는 것은 (종류, 한 줄 설명). 종류는 아래 다섯 가운데 하나다. 위에서부터 맞춘다.

| 종류 | 판정(뷰 트리만) | 뜻 |
|---|---|---|
| `blank` | `<hierarchy` 없음 또는 노드 0개 | 트리를 못 받았다. 화면 꺼짐, 대화상자, 앱 전환 중 |
| `outside` | `package="<요기요>"` 노드가 없다 | 앱 밖(런처, 브라우저, 시스템 창) |
| `error` | 앱 안이고 `ERROR_HINTS`(`capture/common.py`)의 문구가 있다 | 앱 오류 알림 |
| `loading` | 앱 안이고 글자 노드가 `MIN_PAGE_TEXTS`(8) 미만 | 웹 내용이 아직 안 왔다 |
| `other_page` | 앱 안이고 글자 노드가 8 이상 | 그려진 화면인데 헤드라인 꼴이 아니다 |

- 글자 줄 수 8은 처갓집 행사 시험 자료(`tests/test_yogiyo_events.py`)의 줄 수보다 작고, 로딩 스피너 화면보다 클 것으로 잡은 값이다. **실측이 아니다.** 구현자가 §6의 실기에서 로딩 중 덤프를 떠 고친다.
- 설명에는 `글자 N개`와 맨 위 글자 세 줄을 붙인다(`landing_check`의 `where`와 같은 꼴). 사람이 증거 파일을 열지 않고도 짐작하게 하기 위함이다.
- 이 함수는 `discover`의 탭 실패에도 같이 쓴다.

`open_event_drv`는 30초가 지나면 마지막 트리로 `classify_screen`을 부르고 `save_evidence(drv.serial, xml, "yogiyo-event")`로 남긴 뒤 `EventUnread(kind, where, evidence)`를 던진다. `EventUnread`는 `RuntimeError`를 상속하고 글자는 `capture_failed: yogiyo 행사 페이지가 안 열렸다 (<url>) — <종류>: <설명> — 증거 <경로>`로 시작한다. 옛 글자 `capture_failed: yogiyo 행사 페이지가 안 열렸다`가 맨 앞에 그대로 있으니 사람이 쓰던 grep과 `check_routine`의 `capture_failed` 패턴이 그대로 걸린다.

### 3-2. 꼴이 다른 페이지는 실패가 아니라 개략

30초 기다림 안에서 **기간 줄(`PERIOD`)이 보이고 글자 노드가 8 이상이면** 페이지는 열린 것이다. 헤드라인 꼴이 없어도 기다림을 끝내고 트리를 돌려준다. 기간 줄이 열린 판정의 두 번째 양성 신호다. 행사 시트 머리에 늘 있고(`share_link`가 그 줄을 공유 버튼 자리로 쓴다, `scripts/yogiyo_events.py:202`), 브랜드 행사가 아닌 판에도 기간은 있다는 것이 근거다. **꼴이 다른 판에 기간 줄이 있는지는 확인하지 않았다.** 없으면 그 판은 `other_page`로 실패하고 증거가 남으니 다음 결정의 입력이 된다.

`read_all`은 돌아온 트리에서 `parse_offer`가 브랜드나 헤드라인을 못 읽으면 개략을 만든다.

- `summary_texts(texts) -> dict`: `{"period": ("11.03","11.08"), "title": <기간 줄 바로 위 글자 줄>, "lines": <맨 위 글자 다섯 줄>}`. 금액은 만들지 않는다.
- 개략은 배너 제안이 되지 않는다. `banner_ops`가 `요기요 행사 <url>: 개략만 읽었다 — <title> (<기간>)` 한 줄을 찍는다. 사람이 이 줄을 보고 배너를 손으로 세울지 정한다.
- 기간을 읽었으니 `ends`는 지금처럼 쓴다. 닫힌 판은 그 뒤 자동으로 안 열린다(1-2의 7번 절반을 이것으로 메운다).

### 3-3. 캐러셀: 증거, 다시 띄우기 한 번, 뒤 단계 오염 막기

`discover`에서 탭을 못 찾으면:

1. 그 트리로 `classify_screen`과 `save_evidence(serial, xml, "yogiyo-tab")`.
2. 종류가 `outside`, `blank`, `error`면 `force-stop` 뒤 다시 띄우고 `할인/혜택`을 `_wait(tries=10)`로 한 번 더 찾는다. 찾으면 그대로 캐러셀을 훑고 `요기요 할인/혜택 탭: 다시 띄워 찾았다(<종류>)` 한 줄을 찍는다.
3. `other_page`, `loading`이거나 다시 띄워도 못 찾으면 `capture_failed: yogiyo 할인/혜택 탭을 못 찾았다 — <종류>: <설명> — 증거 <경로>`로 던진다.

`other_page`에서 다시 띄우지 않는 이유: 앱 안에 그려진 화면인데 그 글자가 없으면 탭 이름이 바뀌었거나 하단 막대가 다른 화면에 가려졌다. 다시 띄워도 같을 가능성이 크고, 그 증거가 탭 찾는 방식을 바꿀 근거다(§8).

`banner_routine.py`는 `discover_and_add`가 던졌으면 `run_adb(serial, "shell", "am", "force-stop", "com.fineapp.yogiyo")`를 부르고 `read_all`로 넘어간다. 1-2의 4번 가설이 맞든 틀리든 비용이 2초 남짓이다. 끈 뒤 `open_url`이 App Link로 앱을 새로 띄운다. **새로 띄운 앱이 홈 팝업을 먼저 그려 행사 페이지를 가리는지는 확인하지 않았다.** §6 실기에서 본다.

### 3-4. 링크 수명: 연속 실패를 날짜로 세고, 빼는 명령은 사람이

`data/yogiyo_events.json`의 행에 칸 셋을 더한다.

| 칸 | 쓰는 때 | 뜻 |
|---|---|---|
| `last_ok` | 페이지를 연 날(개략 포함) | 마지막으로 열린 날 |
| `fail_days` | 못 연 날마다 날짜 하나. 같은 날 두 번 실패는 한 번. 연 날 비운다 | 연속으로 못 연 날들 |
| `retired` | 사람이 `retire`를 부른 날 | 목록에서 쉰다. 행은 지우지 않는다 |

- `read_all`은 `retired`가 있거나 `ends`가 지난 행을 안 연다.
- `fail_days`가 3일 이상이면 그 행은 계속 연다. 다만 `banner_ops`가 `요기요 행사 <url>: <N>일째 못 열었다 — 닫혔는지 보고 'yogiyo_events.py retire <url>'` 줄을 찍는다. **자동으로 빼지 않는다.** 11-04처럼 폰 상태로 하루 몰려 실패하는 날이 있어, 날짜를 세도 사흘 연속이 우연일 수 있다. 빼는 판단은 사람이 증거 그림을 보고 한다(쿠팡이츠 `targeted_skip`과 같은 원칙, ADR-035).
- `python scripts/yogiyo_events.py retire <주소>`: 그 행에 `retired: <오늘>`을 쓴다. 폰을 안 쓴다. 같은 브랜드 중복 막기(`add`의 `ends` 비교)는 `retired` 행을 끝난 것으로 본다.

`data/yogiyo_events.json`은 `git_sync.py`, `test_reflect_commit_paths.py`가 이미 추적하는 상태 파일이라 경로 목록은 안 바뀐다.

### 3-5. 로그 줄은 고정 꼴

판정기가 읽을 줄을 셋으로 고정한다. 앞 두 칸 띄움은 지금과 같다.

```
  요기요 행사 <url>: 못 읽었다 — 그대로 둔다(<종류>, <설명>, 증거 <경로>)
  요기요 행사 <url>: 개략만 읽었다 — <title> (<시작>~<끝>)
  요기요 행사 <url>: <N>일째 못 열었다 — 닫혔는지 보고 'yogiyo_events.py retire <url>'
```

캐러셀은 `banner_routine.py`의 기존 줄 `요기요 캐러셀 훑기 실패 — 목록만 본다 (<예외 글자>)`을 그대로 둔다. 예외 글자에 종류와 증거가 들어간다.

회차 요약 한 줄을 더한다: `요기요 행사: 연 곳 <a> · 개략 <b> · 못 읽음 <c> · 쉼 <d> · 캐러셀 <성공|실패|건너뜀(3시간 안)>`. `a + b + c`가 연 시도 수와 같아야 한다. 이 줄이 "요기요를 봤다"의 양성 신호다.

### 3-6. 판정기: 6단계 SUSPECT

`check_routine` 6단계에서 위 판정(`reload:` FAIL, `제안서 올림` 없음 FAIL) 다음, `[승인 필요]` 판정과 같은 자리에서 사유를 더한다.

- `요기요 캐러셀 훑기 실패` 줄 → 사유 `요기요 캐러셀 못 훑음(<종류>)`.
- `못 읽었다 — 그대로 둔다` 줄 수 c > 0 → 사유 `요기요 행사 c곳 못 읽음`.
- `N일째 못 열었다` 줄 → 사유 `요기요 행사 링크 정리 필요 <N>곳`.
- 요약 줄 `요기요 행사:`가 **없으면**(요기요 단계가 안 돌았거나 앞에서 죽음) 사유 `요기요 행사 요약 줄 없음`. 단 `--verify`, `--local-banners` 실행은 요기요를 안 도니 제외한다.

사유가 있으면 6단계는 SUSPECT, 없으면 지금 판정 그대로다. FAIL로 올리지 않는 이유: 못 읽은 날은 배너를 그대로 두므로 값이 틀리지 않고(이슈 본문), FAIL은 재시도 표(ROUTINE-SPEC §5)를 탄다. 재시도가 6단계 전체(배민, 쿠팡이츠 제안)를 다시 돌리는 것은 요기요 하나 때문에 과하다.

## 4. "없다 / 0 / 통과"를 내는 자리와 양성 신호

| 자리 | 지금 | 양성 신호 |
|---|---|---|
| `open_event_drv` "안 열렸다" | 헤드라인 꼴 없음 = 안 열림 | 종류(`classify_screen`)와 증거 그림. "안 열렸다"는 `blank`, `outside`, `error`, `loading`일 때만. 앱 안에 기간 줄과 글자 8개 이상이면 열린 것 |
| `discover` "탭을 못 찾았다" | 글자 한 번 못 찾음 | 종류와 증거. 다시 띄워 찾았으면 실패가 아니다 |
| `read_all`의 개략 | (없음. 지금은 실패) | 기간 줄을 읽었다. 기간 없는 개략은 만들지 않는다 |
| 6단계 PASS | 요기요 줄을 안 봄 | 요약 줄 `요기요 행사: 연 곳 …`이 있고, 못 읽음 0, 캐러셀 실패 줄 없음 |
| "N일째 못 열었다" | (없음) | `fail_days`가 날짜로 3개 이상. 같은 날 여러 번은 하루 |
| 요약의 `캐러셀 건너뜀` | (없음) | `discovered_at`이 3시간 안. 실패해서 안 돈 것과 같은 글자로 안 낸다 |

## 5. 원장 (append-only)

원장(`data/log.jsonl`)을 건드리지 않는다. 요기요 행사는 배너 제안만 만들고(`auto: false`) 원장에 안 들어간다. `data/yogiyo_events.json`은 원장이 아닌 상태 파일이고, `retire`도 행을 지우지 않고 칸을 더한다.

## 6. 시험 (결론은 테스트로 박는다)

### 시험 자료 (구현자가 노트20에서 뜬다)

`tests/fixtures/yogiyo_event/`에 뷰 트리 XML을 둔다.

- `opened-brand.xml`: 처갓집 꼴 브랜드 행사(이미 있는 글자 목록을 XML로 감싸도 된다).
- `opened-other.xml`: 기간 줄은 있고 `BRAND_LINE` 꼴이 아닌 판. `4wakv4y`를 열어 뜬다. 열리지 않으면 캐러셀의 결제수단 행사 한 장을 뜬다.
- `loading.xml`: `open_url` 직후 1초 안의 덤프.
- `home-no-tab.xml`: §6 실기 중 `할인/혜택` 탭 실패가 나면 그 증거 XML. 안 나면 만들지 않는다(가짜를 만들지 않는다).

### 폰 없이

`tests/capture/test_yogiyo_event.py`(새 파일. 지금 없다):

- `classify_screen`: 빈 문자열 → `blank`, 런처 트리 → `outside`, `일시적인 오류` 글자 → `error`, `loading.xml` → `loading`, `opened-other.xml` → `other_page`.
- `open_event_drv`(가짜 드라이버, `time.monotonic`과 `time.sleep`을 바꿔 끼움): `opened-other.xml`을 주면 트리를 돌려준다. `loading.xml`만 주면 `EventUnread`이고 글자가 `capture_failed: yogiyo 행사 페이지가 안 열렸다`로 시작하며 `loading`을 담는다. `save_evidence`가 한 번 불린다.
- `summary_texts(opened-other)`: 기간과 제목이 나온다. 금액 칸이 없다.

`tests/test_yogiyo_events.py`:

- `read_all`(가짜 드라이버): 성공이면 `last_ok`를 쓰고 `fail_days`를 비운다. 같은 날 두 번 실패하면 `fail_days` 하나. 다른 날 세 번이면 셋.
- `banner_ops`: 개략은 op를 만들지 않고 `개략만 읽었다` 줄을 찍는다. `fail_days` 셋이면 `3일째 못 열었다` 줄을 찍고 op를 만들지 않는다.
- `retire`: 행이 남고 `retired`가 붙는다. `read_all`이 그 행을 안 연다. 같은 브랜드 `add`가 다시 들어간다.
- `discover`(가짜 드라이버): 탭이 없고 앱 밖이면 다시 띄우고 두 번째에 찾으면 실패하지 않는다. `other_page`면 다시 띄우지 않고 실패한다.
- 옛 행(새 칸 없음)으로 `load`, `read_all`이 그대로 돈다.

`tests/test_check_routine.py`:

- 6단계 구획에 `요기요 캐러셀 훑기 실패` 줄 → SUSPECT, 사유에 `캐러셀`.
- `못 읽었다 — 그대로 둔다` 두 줄 → SUSPECT, `2곳`.
- 요약 줄이 없고 `--verify` 실행이 아님 → SUSPECT, `요약 줄 없음`.
- 요약 줄이 있고 못 읽음 0 → 지금처럼 PASS. 이 시험은 지금 PASS인 6단계 시험 자료에 요약 줄을 넣어야 깨지지 않는다. 기존 6단계 시험을 모두 고쳐 요약 줄을 넣는다.

`banner_routine`: 캐러셀이 던지면 `force-stop`이 `read_all`보다 먼저 불린다(가짜 `run_adb`로 부른 순서를 본다).

### 실기 (노트20, `scripts/collect_trial.ps1`)

- `-Command "python scripts/yogiyo_events.py discover"` 한 번, `-Command "python scripts/yogiyo_events.py"` 한 번. 예약 시각을 피한다.
- 성공 신호: 요약 줄의 `a + b + c`가 목록의 안 끝난 행 수와 같다. `4wakv4y`가 `개략만 읽었다` 또는 증거가 붙은 `못 읽었다`로 나온다(글자만 있는 "안 열렸다"가 아니다).
- 실기 결과를 이슈 댓글에 남긴다: 링크마다 종류, 증거 경로.

## 7. 구현 순서

1. 시험 자료 뜨기(노트20). `4wakv4y`, `gbjbgt3`를 손으로 열어 덤프. 이것만으로 1-2의 3, 5번이 확인된다. 결과를 이슈에 먼저 적는다(이슈 완료 조건 1).
2. `classify_screen`, `summary_texts`, `EventUnread`와 시험(폰 없음).
3. `open_event_drv` 기간 줄 판정, 실패 때 증거.
4. `read_all`의 `last_ok`, `fail_days`, `retire`, `banner_ops` 줄, 요약 줄.
5. `discover` 다시 띄우기, `banner_routine` force-stop.
6. `check_routine` 6단계와 기존 6단계 시험 자료 고치기.
7. `ROUTINE-SPEC.md`, `COLLECTION-INCIDENTS.md` 문단.
8. 실기 두 번. 그 뒤 며칠의 6단계 SUSPECT 사유와 증거로 이슈의 원인 표를 채운다(이슈 완료 조건 1, 2).

1~4와 5~6은 나눠도 된다. 한 PR이 크면 6(판정기)을 먼저 따로 낸다. 판정기는 폰 없이 끝나고, 들어가면 그날부터 실패가 SUSPECT로 보인다.

## 8. 열린 질문

- **11-01~04 실패 줄의 원인.** 이 세션은 로그를 못 봤다. 구현자가 수집 PC의 `logs/`에서 그 줄들 앞뒤를 보고, 같은 회차에 다른 요기요 단계(4c 전수, 5y 쿠폰함)가 어땠는지 이슈에 적는다. 증거 그림은 이번 변경 뒤부터 생긴다.
- **`할인/혜택` 탭을 구조로 찾을지.** 증거가 `other_page`로 쌓이면 하단 막대(화면 아래 10% 안, 가로로 4~5칸 늘어선 노드)의 칸 순서로 찾는 쪽을 후속으로 낸다. 쌓이지 않으면(전부 `outside`, `blank`) 탭 찾기는 그대로 둔다.
- **`MIN_PAGE_TEXTS` 8.** 실측으로 바꾼다.
- **사흘이 맞는 기준인지.** 행사 기간이 대개 일주일이라(목록의 `added`와 `ends` 차) 사흘이면 절반이다. 사람이 보고 바꿀 값이라 상수 하나로 둔다.
