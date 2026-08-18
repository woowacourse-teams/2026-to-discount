# 인수인계 — 배민 브랜드관 수집 이어받기 (2026-08-17)

이 문서 하나로 이어받을 수 있게 적었다. 세션은 넘어가지 않으므로 여기에
남긴 것이 전부다.

## 작업 저장소

```
D:\Dev\_Woowahan-Techcourse\Project\delivery-discount-tracker
```

main 단일 워크트리가 정본이다. 이전 버전이 가리키던
`C:\Users\soldesk\...\worktrees\brand-detail-collection`은 잘못된 지정이었다.
**시작 전에 뒤처졌는지 확인할 것**
(`git fetch origin && git log --oneline HEAD..origin/main`) — 낡은
워크트리에서 이미 있는 기능을 다시 구현한 사고가 있었다. 근거는
`docs/decisions/ADR-018-original-repo-is-the-working-copy.md`.

## 지금 어디까지 됐나

| 앱 | 상태 | 원장 |
|---|---|---|
| 요기요 | 역삼동 브랜드 할인 탭 전수 24카드 | 반영 완료, 수집일 기록 완료 |
| 땡겨요 | 혜택>브랜드쿠폰 전수 24쿠폰/21브랜드 | 반영 완료, 수집일 기록 완료 |
| 배민 배짱할인 | 23건 수집 완료 | **미반영** — `captures/baemin_sweep_2026-08-17.json` |
| 배민 브랜드관 | 68개 중 2개(BBQ, bhc)만 성공 | 미반영 |
| 쿠팡이츠 | 미착수 | — |

`data/export.json`은 171건(비활성 62건 제외)이다.

## 남은 일 1 — 배민 브랜드관 66개

### 돌리는 법

```bash
python scripts/sweep_baemin_links.py --date 2026-08-17
```

이미 받은 브랜드는 건너뛴다. 결과는 브랜드마다 즉시
`captures/baemin_links_2026-08-17.json`에 쓴다.

`--serial`은 생략하면 `adb devices`에 붙은 기기를 자동 감지한다(폰이
바뀌어 시리얼 고정이 더는 안 맞아 2026-08-17에 해제). 기기가 둘 이상
붙어 있으면 에러로 멈추니 그때만 `--serial $SERIAL`로 직접 지정한다.
아래 온도·잠금 확인 명령의 `$SERIAL`도 같은 값 — `adb devices`로 확인.

### 먼저 확인할 것 — 화면 잠금

이게 유일한 실패 원인이었다. 2026-08-17에 68개 중 66개가 전부 같은
에러로 죽었다.

```
deeplink_did_not_open_app: com.sampleapp 화면에 안 뜸
```

**발열이 아니었다.** 화면이 꺼지고 잠금이 걸린 것이었다. 잠긴 화면에선
딥링크가 앱을 못 띄운다. 돌리기 전에 확인한다.

```bash
adb -s $SERIAL shell dumpsys window | grep -E "mAwake=|mDreamingLockscreen"
```

`mAwake=true`, `mDreamingLockscreen=false`여야 한다.

### 화면을 계속 켜두는 법

충전을 물리면 `stay_on_while_plugged_in`으로 계속 켤 수 있지만 **그게
과열의 주원인이었다**(100% 충전 + 계속 급전 + 연속 콜드 스타트).
충전을 뺀 채로 화면 꺼짐 시간만 늘리는 쪽이 낫다.

```bash
adb -s $SERIAL shell settings put system screen_off_timeout 1800000   # 30분
```

30분이면 68개 순회가 끝난다. 배터리 100%라 전원도 버틴다. 백라이트
발열은 콜드 스타트보다 훨씬 작다.

**재부팅하면 이 설정이 날아간다.** 재부팅 뒤에는 다시 넣어야 한다.

### 잠금 해제는 사람이 한다

패턴은 사람이 직접 입력해야 한다. 에이전트가 기기 잠금을 푸는 것은
금지다. 잠겨 있으면 사용자에게 요청하고 기다린다.

### 발열

`capture/thermal.py`의 게이트가 브랜드 사이마다 온도를 본다.

| 기준 | 멈춤 | 재개 |
|---|---|---|
| 배터리 | 41.0°C | 38.5°C |
| PMIC | 52.0°C | 47.0°C |

**식히려고 화면을 끄면 안 된다.** 꺼지면 잠금이 걸리고 거기서 무인
진행이 멈춘다. 화면은 켠 채로 조작만 멈춘다. 실측으로 PMIC 57.9 → 46.3도
내려갔다 — 백라이트가 아니라 콜드 스타트와 웹뷰 렌더가 열원이다.

온도 직접 보기:

```bash
adb -s $SERIAL shell 'for z in /sys/class/thermal/thermal_zone*; do echo "$(cat $z/temp) $(cat $z/type)"; done' | sort -rn | head -3
```

`dumpsys battery`의 `temperature`는 다른 센서라 값이 안 맞는다. thermal_zone 쪽을 본다.

## 남은 일 2 — 배민 원장 반영

브랜드관 순회가 끝나면 배짱할인 23건과 합쳐서 레코드로 바꾼다.

```bash
python scripts/build_baemin_records.py     # -> captures/baemin_records_2026-08-17.json
python ingest.py captures/baemin_records_2026-08-17.json --dry-run
```

합치는 규칙은 스크립트 첫머리에 적혀 있다 — 같은 브랜드가 양쪽에 있으면
큰 금액을 대표로 두되 구간(tiers)은 브랜드관 쪽을 쓴다.

**dry-run 결과를 사람이 대조한 뒤에 실제로 넣는다.**

### 그다음 — 수집일 기록

배민 목록을 처음부터 끝까지 훑었을 때만 적는다.

```bash
python record_sweep.py baemin 2026-08-17 --note "브랜드관 딥링크 68 + 배짱할인 23"
python export_data.py
```

**이걸 적으면 배민 브랜드 약 72개가 export에서 내려간다.** 이번 수집에
안 보였다는 뜻이기 때문이다. 사용자가 이미 승인한 방향(A안)이다. 근거는
`docs/decisions/ADR-020-sweep-is-recorded-not-inferred.md`.

중간에 끊겼거나 일부만 본 날은 **적지 않는다**. 안 적으면 끝난 프로모션이
남는 정도지만, 잘못 적으면 살아 있는 프로모션이 화면에서 사라진다.

## 남은 일 3 — 막힌 것

| 항목 | 막힌 이유 |
|---|---|
| 쿠팡이츠 | 허브 키 `V5_HUB_0808_AC` 만료. 살아 있는 키를 새로 찾아야 한다 |
| 배민클럽 탭 | 스크립트가 0건을 반환한다. 쿠폰함으로 진짜 빈 것인지 먼저 확인 |
| Vercel 팀 이전 | 조직 권한이 필요하다. 에이전트가 못 한다 |
| `expiresAtEstimated` 노출 | API와 웹으로 흘려서 "~8/17 예상"을 띄우는 작업이 남았다 |
| 브랜드 로고 30개 | 사용자가 PNG를 줘야 한다 |

## 아는 사실

- 배민 프로모션은 **월요일 00시에 갱신된다**(2026-08-10 확인).
- 요기요 목록은 **주소에 종속된다**. 그래서 전수 수집 범위에서 뺐다
  (`export_data.SWEEP_SCOPED_PLATFORMS`에 없다). 다른 주소에서 모은 것을
  합치는 구조다.
- 쿠팡이츠는 종료일을 화면에 안 띄운다. export 시점에 수집일 다음
  월요일로 추정하고 `expiresAtEstimated: true`를 붙인다. **원장에는 안
  적는다** — 원장은 화면에서 본 것만 담는다(ADR-004, ADR-023).
- 쿠팡이츠 `pcid`는 기기 식별자다. **저장하거나 공개하지 않는다.**
- 접근성 트리로 브랜드관 목록을 통째로 긁으면 가상 스크롤 때문에 34건에서
  멈춘다. 그래서 딥링크로 한 브랜드씩 연다.

## 먼저 읽을 문서

| 문서 | 왜 |
|---|---|
| `docs/GLOSSARY.md` | "카드"가 세 가지를 가리킨다 |
| `docs/ORCHESTRATION-CONTRACT.md` | 수집·판독·반영의 경계 |
| `parse/CONTRACT.md` | 무엇을 레코드로 만들고 무엇을 버리는지. `conditions`에 날짜를 안 쓰는 규칙 |
| `docs/decisions/ADR-018-...` | 원본 저장소와 모노레포의 관계 |
| `docs/decisions/ADR-020-...` | 수집일을 왜 손으로 적는지 |
| `docs/decisions/ADR-023-...` | 종료일 추정의 범위 |

## 캡처 파일

`captures/`는 이제 커밋된다(2026-08-17). 비공개 저장소이고, 무시해서
문서와 입력 자산을 잃은 일이 반복돼서다. 클론하면 이전 수집 결과와
스크린샷이 그대로 따라온다 — 브랜드관 15장, 배짱할인 결과 JSON 포함.

모노레포(공개)로는 미러하지 않는다.

## 하지 말 것

- 기기 잠금 패턴 입력. 사람이 한다.
- 대조 없이 원장에 넣기. `--dry-run`을 먼저 본다.
- 일부만 훑고 수집일 적기.
- `conditions`에 날짜 쓰기. 기간 제한은 `expires_at`으로 간다.
