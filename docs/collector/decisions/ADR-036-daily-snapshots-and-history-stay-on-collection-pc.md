<!-- 원본: tracker docs/decisions/ADR-036-daily-snapshots-and-history-stay-on-collection-pc.md — 여기서 고치지 않는다 -->
# ADR-036. 날짜별 수집 스냅샷과 할인 이력 파일은 수집 PC에만 둔다

- 날짜: 2026-11-04
- 상태: 확정 (사용자 결정 2026-11-04, 이슈 #137)
- 관련: [ADR-035](ADR-035-loss-guard-stays-targeted-skip-is-standing.md), PR #126, 이슈 #105

## 맥락

PR #126(자동 반영 push를 안정화한 변경)은 수집이 바꾸는 상태 파일 일곱 개를 증거 커밋에 넣었다.
`data/daily/`(날짜별 수집 결과 스냅샷 폴더, 약 2.0MB)와 `data/history.json`(할인 이력 누적 파일, 약 1.8MB)은 추적 여부와 읽는 쪽을 확인하지 못해 그 PR에서 정하지 않았다.

2026-11-04 확인 결과는 다음과 같다.

- 두 대상은 한 번도 추적된 적이 없다. `git ls-files`에 0건이고 커밋 이력이 없다.
- `.github/workflows`가 두 대상을 읽지 않는다.
- 읽는 쪽은 수집 PC의 스크립트(`daily_state.py`, `reflect_daily.py`, `deploy_export.py`, `check_routine.py`, `offer_link_check.py`)와 그 테스트다.

## 결정

1. `data/daily/`와 `data/history.json`은 git이 추적하지 않고 수집 PC에만 둔다. `.gitignore`에 두 줄을 넣는다.
2. 두 대상이 무시되는지 `git check-ignore`로 확인하는 테스트(`tests/test_reflect_daily.py`)를 둔다.

## 근거

- 매일 바뀌는 2MB 안팎의 파일을 저장소에 올리면 변경 이력만 쌓이고 읽는 곳이 없다.
- 추적을 끊어도 원장 추가 전용(append-only) 규칙과 부딪히지 않는다. 원장은 `data/log.jsonl`이고 이 두 파일은 원장이 아니라 원장에서 만든 파생 파일이다.
- 수집 PC 밖(클라우드 실행기)에서 읽는 곳이 생기면 이 결정을 다시 연다.

## 결과

- 정기 수집 뒤 `git status`에 두 대상이 untracked로 남던 것이 사라진다.
- 수집 PC 디스크가 망가지면 두 파일은 복구할 수 없다. `data/daily/`는 원장에서 다시 만들 수 있는지 확인하지 않았다(미확인).

## 보충 (2026-11-18, mono 이슈 #403)

- 서버는 `history.json`의 **사본**을 이미 읽는다. 수집 PC의 `scripts/deploy_export.py`가 매일 올리고(`--history-only` 포함) API가 `discount.history-path`로 `HistoryRepository`에서 읽는다. 위 "읽는 쪽" 목록은 git이 추적하는 소스를 읽는 쪽에 한한 기록이고, 서버 사본은 목록에 빠져 있었다.
- 결정은 그대로다. `data/history.json` 정본은 git이 추적하지 않고 수집 PC에만 둔다. 서버의 사본은 수집 PC가 매일 다시 올리는 파생 파일이며 서버에서 고치지 않는다.
- "수집 PC 밖에서 읽는 곳이 생기면 다시 연다"는 조건은 서버 사본이 정본을 대체하지 않는 한 걸리지 않는다. 서버가 `history.json`을 만들거나 고치는 일이 생기면 이 결정을 다시 연다.
