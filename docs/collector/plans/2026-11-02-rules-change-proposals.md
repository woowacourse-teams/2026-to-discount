<!-- 원본: tracker docs/plans/2026-11-02-rules-change-proposals.md — 여기서 고치지 않는다 -->
# 규칙과 문서 변경 제안 (2026-11-02, 상위 세션 점검용)

이 문서는 **제안만** 모았다. 적용 여부는 상위 세션이 `claude-harness`의 `python check.py -v`를 돌려 보고 정한다.
사용자 지시(2026-11-02): 로고와 링크는 "바로 반영" 규칙 하나로 합친다. 규칙이 덕지덕지 늘지 않게 한다.

## 0. 먼저 바로잡는 사실 (이 세션의 오류)

| 내가 한 말 | 실제 | 근거 |
| --- | --- | --- |
| "자동 재발급 스크립트는 없다" | 링크를 읽는 로직은 있다. 3s(`scripts/coupangeats_share_link.py`)가 열린 허브의 공유 링크를 읽어 기록하고 상수와 다르면 알린다. 월요일 00:01에는 3단계가 먼저 옛 상수 링크로 허브를 열다 죽어(`find_hub_key`는 폴백 없음, 사용자 2026-10-21) 3s가 건너뛰어졌다. | `logs/steps/2026-11-02/3.log`, `capture/coupangeats_hub_key.py` |
| "08:30에 허브 카드 급감 가드가 막을 것이다" | 틀렸다. 월간 목록을 비워서 시험한 탓이다. 실제 입력(화면 47장, 월간 6장 제외 41장)이면 가드는 통과한다(`None`). | 저장 화면 11-02 00:28 폴더를 `visible_fixed_cards`와 `drop_suspect(monthly=…)`로 계산 |
| 허브가 줄었다(정당한 급변) | 줄지 않았다. 11-01 00:01은 저장 화면에도 36장뿐이라 가드가 맞게 막았다. 11-02 V50 화면은 고정 47장(한정 11)에 상단 이벤트 4개로 51장이다. 사용자 관측 항목을 더하면 52다. | `captures/coupangeats/hub-2026-11-01-0008`, `hub-2026-11-02-0028` |
| V50도 와우 회원이다 | 확인하지 못했다. V50 허브 덤프에 "와우" 문구가 0개이고 노트20 덤프에는 "웰컴 배달 할인 쿠폰 (와우회원전용)"이 12개다. 홈에는 "와우할인가"가 보인다. `My 이츠` 탭 진입은 두 번 홈에 머물러 계정 화면을 못 봤다. | 위 두 폴더, V50 홈 덤프 |

이미 바로잡은 곳: tracker `AGENTS.md`, `docs/setup/COLLECTION-INCIDENTS.md`, `claude-harness/rules/git.md`(커밋 전).

## 1. 규칙 변경 제안

| # | 위치 | 지금 | 제안 | 크기 |
| --- | --- | --- | --- | --- |
| 1 | `claude-harness/rules/git.md` | 로고 줄 247B(11-01 세션, 커밋 안 됨) + 링크 줄 669B | **한 줄로 합친다.** 아래 문안 | 약 -500B |
| 2 | mono `AGENTS.md`(main에 push됨 `d16d1a82`) | 로고 예외와 링크 예외 두 문단 | 한 문단으로 합친다. 문안은 #1과 같은 뜻 | 약 -300B |
| 3 | tracker `AGENTS.md` | 이 세션이 6줄 추가(유지 2, 타겟 건너뛰기 2, 링크 2). 지금 94줄 | 항목마다 한 줄과 ADR 링크로 줄인다. 절차는 ADR이 갖고 있다 | -3줄 |
| 4 | `docs/decisions/ADR-034`, `ADR-035` | 각 40~50줄 | 점검만. 규칙 줄이 아니라 결정 기록이라 유지 | 0 |

#1 합친 문안:

> - **브랜드 로고 추가·교체와 쿠팡이츠 주간 공유 링크 교체는 PR과 프리뷰 없이 mono main에 바로 적용한다**(핫픽스, 사용자 2026-11-01·11-02). 로고는 이미지, WebP, `logoManifest.js`만, 링크는 `web/src/offerLink.js`의 `COUPANGEATS_LINK`와 `web/src/offerChip.snapshot.json`의 같은 링크만 바꾸는 변경에 한한다. 링크는 적용 전에 HTTP로 풀어 허브 키(`V5_DEAL_<월일>_HL`)가 이번 주 월요일인지 보고, 적용 뒤 수집 PC의 `tracker/mono`를 `git pull`한다. 그 밖의 웹 변경은 프리뷰 먼저다.

#3 tracker `AGENTS.md`에서 줄일 세 항목(각각 한 줄):

- 유지(`held`)와 제외는 manual 행이고 스키마가 막는다 → [ADR-034](../decisions/ADR-034-hold-is-a-human-judgement-with-guards.md)
- 쿠팡이츠 타겟은 `data/targeted_skip.json`에 박고 사람이 뺀다 → [ADR-035](../decisions/ADR-035-loss-guard-stays-targeted-skip-is-standing.md)
- 쿠팡이츠 허브 링크는 매주 월요일 사람이 준다. 로고와 같이 바로 적용한다 → `rules/git.md`

## 2. 하네스 점검이 실패하는 이유 (규칙 내용이 깨진 것이 아니다)

`python check.py -v` 실패 2건. 둘 다 `rules/git.md` 내용과 무관하게 이미 있던 문제다.

| 실패 | 내용 | 해소 방법(사용자 결정이 필요한 것은 표시) |
| --- | --- | --- |
| 항상 주입되는 분량 | 32,014B가 기준 27,044B보다 4,970B 크다(10% 초과). 이 세션 규칙 줄의 몫은 약 900B(로고 247B는 11-01 세션 것)이고 나머지는 이전부터다. #1로 합쳐도 500B쯤 줄 뿐 초과가 풀리지 않는다 | `baseline.json` 상향(**사용자 결정**) 또는 상시 주입 분량 정리 |
| `memory/MEMORY.md` | 메모리 파일과 목록이 다르다 | `hooks/memory-index.py`로 다시 만든다 |

하네스 작업 트리에는 이 세션 밖의 미커밋 변경이 쌓여 있다(스킬 11개 삭제, `settings.json`, 메모리 2개). 그래서 `rules/git.md`만 경로로 커밋해도 점검이 막는다.
`check.py`는 우회하지 않았다. `rules/git.md`는 디스크에만 수정돼 있고 커밋하지 않았다.

## 3. 상위 세션이 할 일

1. 위 #1~#3 적용 여부를 정한다. 적용하면 `rules/git.md`와 mono `AGENTS.md`를 한 줄, 한 문단으로 합친다.
2. `check.py` 두 건을 푼다. `baseline.json` 상향은 사용자에게 묻는다.
3. 해소한 뒤 `rules/git.md`를 경로로 커밋한다(`GIT_AUTHOR_*` 환경변수는 `claude-harness/README.md`).
4. V50의 쿠팡이츠 계정이 와우인지 사용자에게 확인한다. 와우가 아니면 V50 수집은 와우 월간쿠폰을 못 읽는다.
