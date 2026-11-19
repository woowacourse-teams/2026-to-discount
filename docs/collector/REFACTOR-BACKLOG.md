<!-- 원본: tracker docs/REFACTOR-BACKLOG.md — 여기서 고치지 않는다 -->
# 수정·리팩토링 우선순위

- 작성: 2026-09-28. 세 저장소(tracker, mono, beggars-ops)를 실물로 확인하고 매겼다
- 순서 기준: **지금 조용히 망가뜨릴 수 있는가 × 일어날 법한가 ÷ 고치는 비용**
- 패턴 번호(§)는 `docs/HARNESS.md`다. 여기는 순서만 매기고 왜 반복되는지는 거기 둔다

## 순위

| # | 무엇 | 왜 지금 | 근거 | 비용 |
|---|---|---|---|---|
| 1 | ~~운영 콘솔 사본 셋이 tracker에 남아 있고, 정본이 사본을 고치라고 안내한다~~ | 95c71e4로 해결. `ops_collect.py`, `ops_apply.py`, `ops_dashboard.html` 사본은 지웠다. `banner_ops.py`는 루틴이 여전히 import하는 사본이라 남겨뒀고, 동등성 테스트가 없는 문제는 final-review.md M4로 옮겼다 | — | — |
| 2 | ~~mono Weekly Check가 매주 빨갛다~~ | 09-29 해결. 주간 점검을 tracker `weekly.yml`로 옮겼고(b87cb3c), 옮긴 뒤 빨강의 원인이던 `sweeps.jsonl` 커밋 누락을 고쳤다(3dac50b, run `36468845666` 초록) | — | — |
| 3 | ~~윈도 파이썬이 CRLF로 쓰는 스크립트 셋~~ | 09-29 해결. `ddangyo_links.py`, `yogiyo_links.py`, mono `snapshot.py`, `generate_project_structure.py`가 `newline="\n"`로 쓴다. `tests/test_writers_newline.py`가 소스에서 본다. mono `.gitattributes`에 `* text=auto eol=lf`(`.cmd`/`.bat`은 CRLF). 기존 파일은 다시 쓰지 않았다 | — | — |
| 4 | ~~스케줄 작업이 겹쳐 뜬다~~ | 09-29 정리. 켜진 예약 작업은 `discount-after-open` 하나이고 겹쳐 뜨지 않는다(IgnoreNew). 남은 위험은 멈춘 실행이 다음 실행들을 조용히 건너뛰게 하는 것이었다. `run_routine`이 단계마다 90분을 넘기면 자식까지 끊고 실패로 적는다(재시도 안 함). 예약 작업 시간 제한은 72시간에서 6시간으로 줄였다. 꺼 둔 예약 작업 4개와 그 `.cmd`는 사람이 지운다(권한) | — | — |
| 5 | ~~재설계 사소 지적 중 조용히 틀리는 둘~~ | 09-29 해결. `fromQualifier`는 모르는 값을 `CAPPED`로 둔다(확정 규칙 5절이 예외 경로를 금해서 던지지 않는다. 빈 값은 그대로 `EXACT`). `Banner.build()`가 `startsAt`·`endsAt`이 둘 다 있고 끝이 시작보다 앞이 아닌지 본다. 파일에서 끝이 앞인 한 장은 `dropped`로 간다. 라이브 `/api/banners` 8장은 해당 없음. 서버 `banners.yml` 전체(기간 밖 포함)는 확인하지 못했다 | — | — |
| 6 | 배너 파일에 출처 표식이 없다 | 기계가 사람 것을 못 가려 세 번 덮었다. 배너 자동 반영을 다시 켜는 최소 조건. 09-29 일부 해소: **되풀이 배너만** 서버(beggars-ops `ops_apply.auto_apply`)가 자동 반영한다. 출처는 파일 안이 아니라 서버 원장 `auto_applied.jsonl`(기계가 올린 id)과 `edits/*.jsonl`(사람 편집), 스냅샷 `_human_fields`로 가른다. 그 밖의 배너는 여전히 사람 승인. 값 옆 출처 표식은 아직 없다 **2026-10-15 사용자 결정: 자동 반영을 넓힌다("넓혀도 괜찮을 거 같다, 바로 하고 예후를 본다").** 10-15 반영(beggars-ops e0e5fd7, 배포 확인): 종류가 아니라 출처로 가른다. 새 id의 add, 기계 배너(스냅샷 값 그대로, `_human_fields`와 편집 이력 없음, 승인한 제안 포함)의 set과 expire. 사람이 거부한 같은 일, 되풀이가 아닌 알림 켜기, 되풀이가 아닌 expire 4장 이상은 제안으로 남긴다. 운영 스위치는 2026-09-30 02:32부터 꺼져 있다(콘솔 계정 glen). **10-15 사용자: 아직 켜지 않는다. 배너 기준을 먼저 분명히 하고, 배너 개념 자체가 바뀔 수 있다. 출처 기준으로 넓힌 규칙은 무거워질 수 있다.** 다음 일은 배너 기준 정리 | HARNESS §9 | 중간 |
| 7 | ~~현행 문서의 사라진 참조 잔여~~ | 10-15 다시 판정. 검사 도구가 tracker 안의 작업 폴더(wt-*, .claude, .superpowers) 사본까지 세서 286건으로 부풀었다. 빼니 100건(mono 36, beggars-ops 7, tracker 57). mono 36건을 하나씩 판정해 고칠 것은 0건이었다(지운 사실을 적은 줄, 결정과 설계 기록, 옆 저장소 파일을 정확히 가리키는 줄, 서버 경로와 예시). 설계 31만 머리에 갱신 줄을 달았다. tracker 쪽은 `docs/setup/MINIPC-HANDOVER.md`의 `~/.claude/rules/context7.md` 하나만 확인이 필요하다(홈 경로라 못 봤다) | `PYTHONIOENCODING=utf-8 python scripts/doc_claims.py ../beggars-ops mono .` | — |
| 8 | ~~배포 파일 목록이 두 곳이다~~ | 09-29 해결. Actions가 `deploy/push.sh`를 부른다(beggars-ops `803ef5a`). `tests/test_deploy_list.py`가 `web/` 파일이 목록에 다 있는지 본다 | — | — |
| 9 | ~~`/api/stats/traffic`, `/stats.html` 무인증~~ | 09-29 지웠다(mono `5928b7c`). 부르는 곳이 그 화면뿐이었고 방문 분석은 PostHog가 한다 | — | — |
| 10 | 큰 파일 분리 | 10-15 진행. beggars-ops는 끝(10c7b24, 운영 배포와 수집기 실행 확인): `ops_collect.py` 1176→582줄(ops_fast, ops_history, ops_monitors, ops_alerts로), `ops_apply.py`는 경로를 안 읽는 되풀이 규칙만 `ops_auto.py`로(1150→1064줄). 나머지 자동 반영 함수는 import 때 읽는 경로와 `__main__`으로 뜨는 서비스 때문에 시그니처를 바꿔야 해서 남겼다. 배포 목록 `deploy/push.sh`와 개발 설치 스크립트에 새 모듈을 넣고, 서버가 import하는 모듈이 목록에 다 있는지 보는 테스트를 더했다. tracker 수집은 브랜치 `refactor/split-capture`(01e15d56): `capture/baemin.py` 1105→563(baemin_baejjang, baemin_club), `capture/coupangeats_hub.py` 1110→708(coupangeats_hub_key, _tabs, _relay). 메인 세션의 월간쿠폰 미커밋 변경이 relay 자리와 겹쳐 그 커밋 뒤에 옮겨 합치고 단계 2, 3, 3s 실기 시험을 한다. `web/console.js` 1487줄은 남았다 **10-15 22:40 tracker 수집 분리 합침(983f0df).** 메인의 월간쿠폰 변경(17c8c02, ef4a777)을 relay 모듈로 옮겨 리베이스했다. main `coupangeats_hub.py`의 최상위 정의 67개가 새 모듈 넷에 AST로 같다. 실기 시험(단계 2, 3, 3s) FAIL=0: 2단계 25건, 3단계 32건(같은 날 예약 26건, 32~36건), 월간쿠폰 표시 8건(운영 확인 8건과 같음). 남은 것은 `web/console.js` 1487줄 | `wc -l` | 큼 |
| 11 | ~~`POST /api/reload`가 인증 없이 인터넷에서 받아진다~~ | 09-30 해결. nginx가 콘솔과 같은 Basic Auth를 요구한다(beggars-ops `b63ad32`), 수집 PC 호출은 `<콘솔 인증 파일>`를 싣는다. 무인증 401, 인증 200 확인. 원래 기록: 2026-09-30 확인. 누구나 배너 파일 재적재를 부를 수 있다(부하, 알림 활성화 경로). nginx에서 외부 차단하거나 토큰을 요구한다. 호출처(ops_apply, 루틴)도 같이 맞춘다 | `curl -X POST https://bebeggars.duckdns.org/api/reload` → 200 | 작음 |
| 12 | ~~뒤집힌 기간 배너 3장이 reload를 계속 실패로 만든다~~ | 09-30 해결. 콘솔 편집으로 startsAt을 endsAt에 맞췄다. reload `bannersOk: true`, `dropped` 0. 원래 기록: 2026-09-30 확인. `coupangeats-open-20260930-11시-릴레이`, `-9시`, `-17시`는 startsAt 09-30 00:00, endsAt 09-29 23:59. 내리기 규칙 수정(beggars-ops, 오늘) 전에 내려간 것이라 파일에 남았다. 매 reload `bannersOk=false`, 그동안 알림 활성화가 멈춘다. startsAt을 endsAt으로 맞추는 set 편집 한 번 | reload 응답 `dropped`, `droppedReasons` | 작음 |
| 13 | ~~선착순 배너와 상시 원장 오퍼가 (브랜드, 앱) 한 칸에서 부딪힌다~~ | 09-30 해결(mono `5e65327`, `1759f87`). 선착순 배너는 `platform#first-come` 칸에 서고 같은 쿠폰(금액과 확실성 같음)이면 다시 합친다. 라이브: 맘스터치 상시 3,000원과 선착순 최대 5,000원이 함께 뜬다. 재기동 뒤 확실성 경고 0건. 같은 경고는 한 번만 찍게 먼저 고쳤다(mono `82bf838`). 원래 기록: 2026-09-30 확인. 배너(선착순 최대 N원)가 이기면 같은 브랜드의 상시 위클리 할인(맘스터치 3,000원 등)이 그날 카드에서 사라진다. API가 요청마다 "확실성이 다르다" WARN을 찍는다(하루 200건대). 랜덤 오퍼의 `platform#random`처럼 `firstCome` 배너를 따로 된 칸에 두는 안을 권한다. 카드에 쿠팡이츠 오퍼가 둘 뜨므로 프리뷰 확인 필요 | `BrandComparisonService` 슬롯, journalctl WARN | 중간 |
| 14 | ~~API 배포가 유중단이다~~ | 2026-10-28 해결. 배포 중에만 임시 인스턴스(8089)를 띄우고 본 인스턴스(8088)가 재시작하는 동안 nginx upstream의 `backup`이 받는 방식으로 바꿨다. 서비스 이름과 포트를 번갈아 바꾸는 후보안은 그 둘을 하나로 가정한 곳이 열 군데 넘게 깨져 쓰지 않았다. mono #188(배포 스크립트), beggars-ops #27(nginx, 서버 설치, 설계 `docs/design/zero-downtime-deploy.md`), 미러 `deploy.yml` `0268857`. 첫 배포에서 공개 API 75회 조회 중 200 아님 0회(mono 이슈 #189). 남은 일: 푸시 상태와 기프티콘 파일의 프로세스 간 락(mono #192). 아래는 해결 전 기록이다. 2026-09-30 확인. 배포가 `systemctl restart`로 내렸다 올려 앱이 뜨는 약 5초 동안 502가 난다. 지금은 트래픽이 적어 실측 502는 0건. 두 포트를 번갈아 띄우고 nginx upstream만 바꾸는 방식이 후보. 언급만 해 둔다  2026-10-14 추가: 서버의 러너가 `./gradlew build`(테스트 포함)까지 돌려 빌드 동안 운영 CPU도 쓴다. 배포 워크플로(`deploy.yml`)는 미러 `nn98/delivery-discount-api`에만 있다(mono 미러가 `.github`를 남긴다). 미러에 직접 push하지 않는 규칙이라 사람이 미러 워크플로를 바꾸는 결정이 먼저다. 방향: mono `check-api`가 jar를 만들어 넘기고 서버는 받아서 교체만, 두 포트 교대와 nginx upstream 전환. Spring Boot 4.1부터 우아한 종료(graceful shutdown, 내릴 때 새 요청은 막고 처리 중 요청은 끝낸다)가 기본이다. 새 요청이 못 들어오는 약 5초는 그대로다(api ADR-012). 2026-10-14 사용자 결정: mono에서 미러로 옮기는 구조라 5초 끊김은 지금은 유지한다 | api 저장소 `deploy.yml`, journalctl Started 간격 | 중간 |
| 15 | 선착순을 상시 오퍼의 티어로 편입한다 | 2026-09-30 사용자 결정. 지금은 같은 앱의 선착순·상시 확정 오퍼 중 금액 큰 쪽 하나만 세우고 선착순이 소진되면 상시가 선다(mono `6b00a55`, 배포 대기). 소진은 수집 시각에만 보여 그 사이엔 끝난 선착순이 상시를 가릴 수 있다. **선착순 소진·상시를 계속 보는 감시 봇이 돌면** 선착순을 상시의 티어(열림 시각·소진 표시가 붙은 구간)로 편입해 한 오퍼로 보여 준다 **2026-10-15 사용자 결정: 감시 봇(L3)을 기다리지 않고 지금 합친다("굳이 따로 둘 이유 없다, 바로 하고 예후를 본다").** 10-15 구현: mono PR #85(`Offer.withFirstComeTier`). 금액이 다르면 상시 오퍼에 택일 구간으로 붙고, 선착순 구간에 소진과 조건 문구가 붙는다. 웹 변경 없음. 운영 데이터로 jar 비교, 배민 8곳만 바뀜. 병합 대기 | 청년피자 쿠팡이츠 10,000원(선착순)·7,000원(상시) | 중간 |
| 16 | ~~쿠팡이츠 허브 탭 링크를 오퍼 링크로 내보낸다~~ | 2026-10-07 내보내기·계약 반영(tracker export_data `link`, mono `8eef0dc` exportKeys). API는 OfferRecord.link를 그대로 내보낸다. 웹 사용은 프리뷰에서 결정. 원래 기록: 2026-10-06 사용자 결정: 프론트 리워크 뒤에. 수집기는 원장 `hub_tab: {"no", "link"}`에 탭을 여는 앱 링크(`coupangeats://Web?url=…landing-page-v5?key=<허브키>&anchorTabNo=N&navType=push`)를 적는다(tracker `a10ae18`). 웹까지 보내려면 내보내기 칸(`export_data.py` FIELDS), 계약(`offer-cases.json` exportKeys/offerKeys), API(오퍼 `link` 채우기)를 함께 바꾼다. 웹은 지금 쿠팡이츠를 공유 링크(`VzILg2hUX6b`)로 고정한다(`offerLink.js` COUPANGEATS_LINK) — 탭 링크를 쓸지, 앱 없는 폰 대비 공유 링크로 되돌아가는 장치를 둘지 함께 정한다. S9+는 허브 화면에 탭 표시가 없어 탭을 못 가린다 | 원장 `hub_tab`, `tests/test_coupangeats_hub_tabs.py` | 중간 |
| 17 | ~~설문 판정과 인기가 이벤트 원장 전체를 요청 중에 다시 읽는다~~ | 10-14 해결(mono `a6629aa`, api ADR-011). 웹이 첫 화면마다 부르는 `/api/survey`가 원장 전체를 훑었고, 인기는 10분마다 한 요청이 같은 일을 떠맡았다. 원장 177MB, 34만 줄, 하루 약 5천 줄씩 는다. 이제 읽은 위치를 기억해 새 줄만 읽는다. 운영 `/api/survey`가 1.9초에서 8~16ms로 줄었다. `/api/brands`를 12분 동안 50번 부른 측정에서 10분마다 오던 2,058ms가 사라졌다(가장 느린 것 698ms). 가운데 값은 175ms에서 228ms로 올랐지만, 응답 시간을 나눠 잰 결과 서버 몫(첫 바이트까지)은 약 20ms이고 나머지는 연결과 암호화 연결(약 100ms)이라 네트워크 변동이다(23시 재측정 합계 가운데 138ms) | 바깥 측정 2026-10-14 19:33~19:45, 22:39~22:50 각 50번 | — |
| 18 | ~~Spring Boot 3.3.5는 지원이 모두 끝났다~~ | 10-14 해결(mono `811522e`, api ADR-012). 4.1.1과 Jackson 3. 응답과 이벤트 원장 모양은 Jackson 2 기본값으로 지켰다. 파싱 예외가 `IOException`이 아니게 되며 조용히 바뀔 뻔한 네 자리(푸시 상태 기동 실패, PostHog 대기 파일 격리, 잘못된 이벤트 본문 500, export 로그)를 예전 길로 돌렸다. 4.1 무료 지원은 2027-07-31까지 | 배포된 jar와 같은 입력으로 응답 비교 | — |
| 19 | ~~비교 서비스가 배너 해석과 비교를 같이 든다, `OfferRecord`는 21칸 위치 인자~~ | 10-14 해결(mono `d324ee7`). 배너를 오퍼로 바꾸는 일을 `banner/BannerOffers`로 뗐다(서비스 455줄에서 240줄). `OfferRecord.builder`를 두고 호환 생성자 둘을 지웠다(호출 31곳) | 배포된 jar와 응답 비교 | — |
| 20 | ~~api README가 옛 저장소 구조, 수동 scp 배포, 옛 배너 모양을 안내한다~~ | 10-14 해결(mono `e7a656a`). 세 배포 길, 패키지와 엔드포인트 표, 새 배너 모양 예시. 코드에만 있던 설정 기본값 셋을 `application.yml`로 | — | — |
| 21 | ~~옛 모양 배너 읽기(Task 19)~~ | 10-15 해결. 00:00 서버 보관으로 운영 옛 모양 0장이 된 뒤 지웠다. mono `242627c7`(api: 문자열 amount, period/extra, startsOn/endsOn, limit/usage, mixedShape, 문장 되짚기. 운영 코드 약 480줄), `557b0394`(문서), beggars-ops `c609a8d`(콘솔이 문자열 amount 거절, `convert_banners.py` 삭제), tracker 사본과 계약 해시. 문자열 amount 배너는 이제 사유와 함께 `dropped`가 되고 reload가 `bannersOk=false`라, 콘솔 검사를 같이 조였다. 콘솔과 수집기의 옛 칸 처리(`banner_ops`의 endsOn 내리기, `ce_inheritable_amount`의 "최대" 문장)는 새 모양 배너에서는 안 타는 길이라 남겼다. 단 `banner_ce.shrink_banner`는 새 모양 묶음 배너(`brands` 여럿, 금액 지도)에서 한 브랜드가 빠지면 금액에 문자열 정규식을 써 `TypeError`로 죽는다(10-15 직접 불러 확인, 6단계 제안이 실패한다). 운영 배너 11장에 `brands`가 없어 아직 안 터진다. 수집 코드라 실기 시험과 같이 고칠 것 | 배포된 jar와 새 jar를 운영 배너 11장, 보관 전 113장으로 띄워 응답 다섯 가지 모두 같음 | — |
| 22 | ~~수집기와 콘솔의 옛 칸 처리 잔재~~ | 10-15 해결. 콘솔(`banner_ops.shape_problem`)은 옛 칸이 하나라도 있으면 거절한다(전에는 섞어 적은 것만 막아 날짜만 적은 배너가 통과했고, 서버가 그 배너를 dropped로 빼 알림이 멈출 수 있었다). 수집기의 옛 칸 처리(쓰지 않던 문구 함수 6개, 옛 묶음 금액 나누기, `--inherit-amount`)를 지우고, `shrink_banner` TypeError를 고쳤다. 하루짜리 배너를 늘리지 않는 가드가 옛 period 문장을 보다 09-29부터 꺼져 있던 것을 시작일과 끝일로 되살렸다. 콘솔 화면의 옛 칸 편집기도 걷었다 | tracker 1443 통과, beggars-ops 배너 테스트 73 통과, 배너 단계 실기 시험(제안서는 파일로만) | — |

## 막혀 있는 것

- **PostHog dead-letter 재투입 도구.** 09-28 기준 0건. 쌓이면 알림이 온다(beggars-ops 알림 표)

## 확인해 보니 이미 닫힌 것

| 원래 적힌 곳 | 무엇 | 닫은 것 |
|---|---|---|
| 재설계 "남은 일" | `apply_edits`·`apply_proposal` 끝-끝 테스트 없음 | `beggars-ops/tests/test_apply_end_to_end.py` 8건 |
| 재설계 "남은 일" | `banners.yml` id 유일성 검증 없음 | API가 읽을 때 잡는다(mono `b7e0fc3`), 콘솔은 `duplicate_id_problem` |

## 고칠 때

한 번에 하나. 각 항목은 브레인스토밍으로 방향을 정하고 나서 구현한다. 브레인스토밍 승인은 구현 승인이 아니다(HARNESS §10).

## 이후 계획: 1+1 묶음 행사 (2026-10-11 사용자, 지금은 안 한다)

- **반복 일정 칸.** KFC 치킨올데이처럼 매월 11일 반복하는 행사를 배너 한 장으로 적는다. 지금은 날마다 따로 올린다.
- **자사앱 행사 자동 확인.** 폰으로 못 보는 자사앱 행사(KFC 프로모션 페이지 등)를 주기적으로 읽어 배너 제안을 올린다.

## 이후 계획: 배너를 리스트 안 "한정 오퍼 강조"로 (2026-10-15 사용자, 후순위)

- 사용자 결정: 상단 배너를 브랜드 카드 리스트 안으로 옮긴다. 역할은 광고 배너가 아니라 이벤트, 한정 오퍼 중 금액이 크고 매력적인 것을 강조하는 자리다. 지금 바로 하지 않는다(후순위).
- 근거(PostHog 2026-10-01~15): 배너 노출당 클릭 1.2%(25,747번 중 310번), 카드 링크 4.2%(45,208번 중 1,893번). 배너를 닫은 방문자 353명이 누른 방문자 201명보다 많다. 배너 브랜드도 카드에서 1,207번, 배너로 310번 눌렸다.
- 먼저 한 것(2026-10-15): 하단 배너 도크는 남기고 좌우 폭을 줄이고 넘김을 5.3초에서 8초로 늦췄다(mono preview/no-banner-dock). 사용자: 빼기보다 덜 거슬리게 두고 예후를 비교한다. 비교 기준선은 위 10-01~15 수치. 배너 오퍼는 카드에 같은 금액으로 이미 있다.
- 위치는 정하지 않았다: 카드 클릭은 1번 자리에 33%(624번)가 몰린다. 신규를 1번에 올린 것(10-15)도 효과를 재지 않았으니, 강조 자리와 신규 자리는 같은 A/B에서 함께 잰다.
- 판정: 홈 실험(a/old) 판정(10-23~25) 뒤 A/B로. 함께 걸면 결과가 섞인다.
- 배너 자리를 쓴다면 "오늘 인기"(클릭 기준 순위)를 키운다. 검색어 순위(실검)는 하지 않는다: 검색 제출 방문자가 14일 217명(하루 10~34명)이고 1위 검색어(bbq)도 9명이라 순위가 소음이다.
