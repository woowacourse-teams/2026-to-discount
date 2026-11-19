<!-- 원본: tracker docs/experiments/2026-11-11-dump-ways/README.md — 여기서 고치지 않는다 -->
# 덤프 방식 비교 실험 모음 (2026-11-10 ~ 11)

수집 PC의 저장소 밖 폴더(`<사용자 폴더>\_dev\u2exp\`, `<사용자 폴더>\_dev\fdump\`)에 흩어져 있던 실험 스크립트와 측정 결과를 그대로 옮긴 것이다. 원본 폴더는 지워질 수 있어 이 사본이 기록이다. 상위 이슈와 전체 목차는 [`docs/research/2026-11-11-dump-way-index.md`](../../research/2026-11-11-dump-way-index.md).

스크립트는 수집 PC 절대 경로(`<사용자 폴더>\_dev\...`)를 그대로 쓴다. 다시 돌릴 때는 경로와 `REPO` 환경변수를 고친다. 고친 판은 저장소 `scripts/`로 올린다(작업 묶음 1).

## u2exp/ (패치 u2 쪽 실험, WSL 세션)

| 파일 | 하는 일 |
| --- | --- |
| `lab.py` | 같은 폰에서 기존 덤프, u2 덤프를 뜨고 노드 수, 글자, 웹뷰 후손 수를 세는 공용 함수 |
| `step1.py`, `step1b.py`, `step1c.py` | 배민 쿠폰함에서 기존 대 u2 노드 비교, 빠진 노드 분석, u2 선택자로 숨은 노드 찾기 |
| `cmp2.py` | 같은 화면에서 글자 집합 차이(기존에만, 후보에만) |
| `bench3.py`, `bench4.py` | 같은 화면에서 기존, 기존, fdump, 패치 u2, 기존을 연달아 떠서 견줌. `bench4.py`는 이모지 차이 확인 |
| `parity.py`, `hubparity.py`, `hubonly.py`, `parity4a.py` | 단계 스크립트(5, 5a, 5y, 허브 3, 4a)를 기존 대 u2로 돌려 결과 JSON을 견줌. 가짜 날짜로 저장하고 지움 |
| `patchjar.py`, `patchjar2.py` | `u2.jar`의 `isVisibleToUser` 건너뛰기, 이모지 치환 분기를 지운 사본 만들기(실험용, 운영은 `capture/fleet/u2_jar.py`) |
| `dumprec.py`, `dumpstrip.py`, `findvis.py` | androguard로 `u2.jar` 바이트코드에서 해당 분기 찾기 |
| `conf.py`, `flags.py` | u2 서버의 Configurator 값과 접근성 플래그(65618) 확인 |
| `linkchk.py`, `showways.py` | 쿠팡이츠 공유 링크 풀림 확인, 폰별 `dump_way` 출력 |
| `stability.py`, `trial.py`, `cmp.py`, `measure.py` | 11-10 오후 V30 안정성(150회), 첫 측정과 비교 |

## fdump/ (자체 덤프 서버 쪽 실험과 단계 측정, main 세션)

| 파일 | 하는 일 |
| --- | --- |
| `measure_all.py` | 폰 3대 × 단계 × 후보 3개(기존, 패치 u2, fdump)를 돌려 결과 JSON, 단계 시간, 덤프 중앙값, 물러섬을 한 줄씩 `measure_all.jsonl`에 쌓는다 |
| `measure_all.jsonl`, `measure_all.out` | **2026-11-11 00:08~00:24 측정 결과(18건)**. 후보당 6회, 한 번씩 |
| `parity_fdump.py` | `parity.py`와 같은 방식, 후보만 기존 대 fdump |
| `trial_couponbox.py`, `trial_order.py`, `trial_parity.py`, `trial_v30.py`, `cmp_xml.py` | fdump 개발 중 시험(쿠폰함, 앱 실행 순서, V30) |

`FDump.java`와 `fdump.jar`는 여기에 없다(브랜치 `feat/fdump`와 작업 묶음 2에서 다룬다).

## dlexp-main/ (쿠폰함 딥링크 진입 실측, main 세션, 11-11 13:30~14:40)

sub의 `<사용자 폴더>\_dev\dlexp`(V30용) 스크립트를 노트20, V50용으로 고친 것. 결과 해설은 경과 보고 4.8절.

| 파일 | 하는 일 |
| --- | --- |
| `dl_run.py` | 쿠폰함 단계 스크립트(5, 5y, 5a)의 진입 함수만 딥링크로 바꿔 돌린다. 10초 안에 안 닿으면 딥링크를 다시 쏜다(배너를 누르지 않음, 사용자 11-11). 쿠팡이츠 도착은 `dumpsys window`의 `mCurrentFocus`로 본다 |
| `dl_parity.py` | 같은 폰에서 홈 경로와 딥링크를 번갈아 n회 돌려 결과 JSON을 견준다. 실행마다 `wake_phones.py`로 깨우고, 다르면 다른 항목을 남긴다. `DUMP_WAY`로 덤프 방식, `DL_MONTH`로 가짜 날짜의 달을 정한다 |
| `run_all.py` | 폰 둘을 같은 앱이 겹치지 않게 짝지어 adb, fdump 순으로 `dl_parity.py`를 돌린다 |
| `results.jsonl` | 결과 전부. **13:3x~13:5x 줄은 측정 결함이 섞였다**(화면 꺼짐, 쿠팡이츠 도착 판정, 날짜 공유 경합). 4.8절 표는 결함을 고친 뒤 줄만 쓴다 |

## 알려진 한계

- `measure_all.py`는 폰 스레드들이 같은 가짜 날짜(`2099-05-10` ~ `12`)를 공유하고 단계마다 그 날짜 파일을 지운다. 00:24에 노트20 5a fdump가 `FileNotFoundError`로 실패한 것은 이 경합으로 보인다(추정). 작업 묶음 1이 고친다.
- `measure_all.py`는 단계 출력(`[suspect] ... 덤프 실패` 줄)을 저장하지 않아 물러섬 이유가 안 남는다.
- 후보당 한 번씩만 돌아 표본이 작다.
