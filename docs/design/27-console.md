# 27. 콘솔을 팀의 입구로 키운다: 관례 조사와 다음 순서 (2026-09-18)

결정(2026-09-18, 사용자): 다른 도구를 들이지 않고 지금 구조를 유지한다. 5절의 순서대로 간다. 기술 학습이 필요한 항목은 별도 트랙으로 뺀다(5절에 표시). 이 문서는 운영 콘솔(수집과 서버 상태를 보고 배너를 고치는 관리 화면. `https://bebeggars.duckdns.org/ops/`, 2026-09-18 "배짱할인 콘솔"로 이름 붙임)을 어디까지 키울지 정하기 전에, 같은 종류의 도구가 세상에서 어떻게 만들어지는지 조사한 결과와 그 관례를 우리 구조에 붙이는 순서다. 사용자 방향(2026-09-18): 기능을 혼자 개발해 버리기보다 팀원이 프로젝트 구조와 기능을 파악할 수 있게 콘솔과 대시보드(상태를 한눈에 보는 화면)를 먼저 판다. 새 기능은 기존 설계(21, 22, 24, 25, 26)를 검수하고 참고하며 진행한다.

## 1. 지금 상태

| 자리 | 무엇 | 만든 날 |
|---|---|---|
| 수집 탭 | 예약 실행(미니PC가 하루 세 번 스스로 도는 수집)의 단계 표(제목과 설명은 `scripts/run_routine.py`의 `STEP_TITLES`), 단계 로그, 실행 전체 출력을 보여 주는 터미널 창 | 09-17, 터미널은 09-18 |
| API, 데이터, 웹, 서버, 배포 탭 | 서버 cron(정해진 시각에 명령을 돌리는 리눅스 예약 기능) `ops_collect.py`가 5분마다 쓰는 JSON(기계가 읽는 자료 형식) | 09-17 |
| 배너 탭 | 배너 루틴의 제안(승인 또는 거부 뒤 반영)과 `banners.yml`(배너 목록을 적은 설정 파일) 편집기(목록, 추가, 편집, 내리기, 저장과 저장 후 반영) | 09-18 |
| 슬랙 | 시작, 재시도, 실패, 완료를 풀어쓴 문장으로 | 09-17, 문장은 09-18 |
| 서버 쪽 | 정적 HTML(서버가 그대로 내려주는 웹 페이지 파일) 한 장 + `ops_apply.py`(서버 안에서만 열린 포트 8090의 작은 파이썬 프로그램. nginx(웹 서버)의 Basic Auth(아이디와 비밀번호를 묻는 가장 단순한 웹 인증) 뒤에 있다) + 파일(`banners.yml`, 제안서 JSON, 편집 이력 `edits/<날짜>.jsonl`(한 줄에 JSON 하나씩 덧붙이는 파일)) | |

Spring API(자바 서버. 웹 화면에 자료를 내려주는 쪽)에는 쓰기 경로(자료를 고치는 요청을 받는 주소)가 없다(설계 21의 전제). 콘솔의 쓰기는 전부 별도 파이썬 프로세스가 파일 하나를 고치는 것이다(21의 7절 예외).

## 2. 문제

1. 팀원이 프로젝트 구조를 파악할 입구가 문서뿐이다. 문서는 저장소 세 곳(mono, tracker, 위키)에 흩어져 있고 어느 것이 살아 있는 사실인지 읽는 사람이 판단해야 한다.
2. 콘솔은 지금 "보는 화면"에서 "결정하는 화면"으로 막 넘어왔다. 이 상태에서 기능을 더 얹으면 무엇을 기준으로 얹을지가 없다. 검수 화면(22. 사람이 수집 결과를 확인하고 고치는 화면), 검수 API(24. 그 화면이 서버에 고치라고 보내는 통로), 배너 문구 구조화(25)가 계획으로만 있다.
3. 편집 이력이 "무엇으로 바꿨나"만 있고 "무엇에서"와 "누가"가 없다(`edits/<날짜>.jsonl`의 `who`는 비어 있다).

## 3. 조사: 같은 종류의 도구가 지키는 관례

조사 날짜 2026-09-18. 출처는 문서 끝.

### 3-1. 운영 대시보드(서비스가 지금 정상인지 보는 화면)

- 좋은 운영 화면의 기준은 "필요한 것을 보고 그 자리에서 행동하기까지의 시간"이다. 사진처럼 예쁜지가 아니다.
- 사용자가 가장 자주 묻는 질문부터 그 화면의 결론을 먼저 설계한다. 큰 상태 표시, 색으로 구분한 상태 격자, 정렬과 필터가 되는 예외 목록.
- 패널(화면의 한 칸)마다 런북(그 상황에서 무엇을 하는지 적은 절차 문서) 링크를 단다. 알림과 사고 도구에 연결한다.
- 밤에 오래 보는 화면은 어두운 배경이 기본이고, 경고 색이 배경에서 튀어야 한다.

우리 콘솔은 어두운 배경, 단계별 상태, 침묵 경고까지는 맞다. 없는 것은 "지금 할 일"을 맨 위에 모은 자리(승인 대기 N건, 실패한 단계, 저장했지만 반영 안 한 배너)와 단계마다 다는 런북 링크(`ROUTINE-SPEC.md`의 그 단계 절)다.

### 3-2. 변경 이력(감사 로그. 누가 무엇을 언제 바꿨는지 남기는 기록)

- 이력 한 줄이 답해야 하는 다섯 가지: 누가, 어느 배너를, 무엇에서 무엇으로, 언제, 어디서(콘솔 화면인지, 루틴의 자동 반영인지).
- 고친 것은 바뀐 필드만 이전 값과 새 값을 함께 적는다. 새로 만든 것과 지운 것은 배너 전체를 적는다.
- 이력 파일은 덮어쓰지 않고 줄을 덧붙이기만 한다. 배너 파일(`banners.yml`)과 다른 파일에 둔다. 요컨대 로그에 내용을 다 담고, 로그를 나중에 고치지 않는다는 뜻이다.
- 화면에는 시각, 누가, 동작(추가, 고침, 내림), 대상 배너, 결과(반영 성공 또는 실패)를 한 줄로 보여 주고 펼치면 값이 보인다.

우리 `edits/<날짜>.jsonl`은 덧붙이기만 하는 별도 파일이라는 점은 맞다. 이전 값과 누가가 빠져 있다. who는 nginx가 Basic Auth 사용자 이름을 `X-Ops-User` 헤더로 넘기면 채워진다(계정을 사람별로 나누는 것이 전제, 24).

### 3-3. 사람이 승인하는 흐름 (배너 제안의 승인)

배너 루틴이 폰 화면에서 읽은 것과 지금 배너를 견줘 "이렇게 바꾸자"를 제안하고, 사람이 콘솔에서 승인하거나 거부한 뒤 서버가 반영한다. 이런 "기계가 제안하고 사람이 승인하는" 흐름을 설계할 때 세상이 지키는 관례는 둘이다.

- 승인 단계를 몇 번 거치게 할지는 그 변경이 얼마나 위험한지로 정한다. 단계를 늘리면 느려질 뿐 틀린 승인을 더 잘 막지는 못한다.
- 제안한 사람과 승인하는 사람이 달라야 한다면 그 규칙을 문서에 적는 것으로 끝내지 않고 코드가 막게 한다.

우리 흐름은 승인이 한 번이다. 기계가 관측한 사실(배민 핫딜 화면, 링크로 확인한 기간)은 `auto`로 표시해 루틴이 스스로 반영해도 되고, 사람이 쓴 배너를 건드리는 제안은 `승인 필요`로 표시해 사람이 봐야 한다. 이것이 "위험으로 단계를 정한다"는 관례와 같다. 지금은 제안이 기계, 승인이 사람이라 둘이 이미 다르다. 사람이 콘솔에서 직접 고치는 편집은 승인 없이 바로 반영되는데, 팀이 커져 그것도 다른 사람이 봐야 하게 되면 코드로 막는다.

### 3-4. 설정 변경을 저장소로 (GitOps. 서버 설정도 코드처럼 git 저장소에 두고 바꾸는 방식)

- 설정 변경을 풀 리퀘스트(저장소에 "이렇게 바꾸겠다"고 올려 다른 사람이 보고 합치는 요청)로 낸다. 리뷰, 자동 검사, 승인, 되돌리기가 저장소 기능으로 따라온다.
- 작은 팀도 자동화할 만큼만 자동화하고 나머지는 수동 승인으로 둘 수 있다.

우리 `banners.yml`은 서버 파일이고 저장소 밖이다. 사람이 자주 고치는 파일이라 배포 없이 reload(서버가 파일을 다시 읽는 것)만 하도록 정한 것이다(`banners.yml` 머리말). 콘솔로 편집하는 것도 바로 그 저장소 밖 파일들이고 이력은 `edits/`에 남는다. 그래서 편집을 git 커밋으로도 남기는 것은 하지 않는다(사용자 결정 09-18). 백업 `.bak-<시각>`과 `edits/` 이력으로 되돌린다.

### 3-5. 개발자 포털 (Backstage 류. 회사 안 서비스와 문서를 한곳에 모아 보여 주는 내부 사이트)

- 팀이 이런 포털을 두는 이유: 개발자가 문서를 찾고, 서비스 소유자를 알아내고, 여러 대시보드 사이를 오가는 데 시간의 4분의 1 가까이를 쓴다. 온보딩(새 팀원이 일을 시작할 수 있게 되는 것) 시간이 40~60% 준다는 보고가 있다.
- 핵심 둘. 카탈로그(목록. 무엇이 어디에 있고 누가 맡고 무엇에 의존하는지)와, 저장소 안 `docs/` 폴더의 마크다운 문서(위키가 아니라 코드와 같은 저장소에 커밋되는 문서)를 포털 화면 안에서 그대로 보여 주는 것(TechDocs).

이것이 사용자가 말한 "팀원이 구조와 기능을 파악하는 입구"에 가장 가깝다. 우리 규모에 Backstage를 세우는 것은 과하다. 같은 뜻을 정적 HTML 한 탭으로 낼 수 있다. 저장소, 서비스, 경로, 담당, 문서 링크를 표 하나로 두고, 살아 있는 문서(`ROUTINE-SPEC.md`, 설계 목록 `docs/design/README.md`, `WORKFLOW.md`)로 바로 간다.

### 3-6. 직접 만들기와 가져다 쓰기

- 관례는 "백엔드 프레임워크(서버 코드의 뼈대)에 딸려 오는 관리자 화면(Django admin 류. 파이썬 Django가 자료 편집 화면을 자동으로 만들어 주는 기능)으로 시작해 흐름을 파악한 뒤, 여러 도구가 필요해지면 Retool 같은 조립 도구(코드 없이 화면을 끌어다 붙이는 유료 서비스), 완전한 통제가 필요하면 직접 만든다"이다.
- 우리 데이터는 DB(데이터베이스)가 아니라 파일(yml, JSON, jsonl)이고 API는 Spring이라 Django admin 류가 없다. 팀은 2~3명, 화면은 탭 7개, 이미 정적 HTML로 서 있다. 직접 유지가 맞다.
- 다시 볼 조건: 편집 대상이 파일에서 DB로 옮겨 가거나, 사람별 권한이 필요해지거나(24), 탭이 열 개를 넘을 때.

## 4. 대안과 선택

| 갈래 | 내용 | 판단 |
|---|---|---|
| A. 지금 구조 유지, 관례를 탭과 규칙으로 더한다 | 구조 탭, 지금 할 일, 이력 탭, 런북 링크, 편집 이력에 before와 who | **선택.** 서버 변경 없이 HTML과 `ops_apply.py`만으로 된다 |
| B. 조립 도구(Retool 류) | 파일을 API로 감싸야 하고 계정 비용이 든다 | 기각. 데이터가 파일이고 팀이 작다 |
| C. Backstage | 카탈로그와 TechDocs를 그대로 얻는다 | 기각. 서비스 한 대에 포털 한 대는 과하다. 3-5의 뜻만 A로 가져온다 |
| D. 편집을 git 커밋으로 | 이력과 되돌리기를 저장소로 통일 | 보류. 3-4. 팀 3명을 넘고 되돌리기가 실제로 필요해질 때 |

## 5. 실행 순서 (승인 2026-09-18)

기존 설계와 이어지는 자리를 적는다. 1~4는 부가 기능이라 바로 진행한다. 5와 6은 설계와 학습이 따로 필요해 별도 트랙이다.

1. **구조 탭** (3-5). 저장소 3개, 서비스(API, 웹, 수집 PC, 콘솔), 서버 경로, 예약 시각, 담당, 문서 링크 표. 문서는 링크만 하고 복사하지 않는다(사본이 갈리는 실패, HARNESS §5). 같은 탭에 **큰 단위 흐름 초안**(수집 → 원장 → 반영 → 노출, 관측 → 제안 → 승인 → 반영)과 **할 일 목록**(살아 있는 설계의 다음 단계)을 둔다. 흐름은 확정이 아니라 초안이고 세부는 각 설계 문서가 맡는다.
2. **지금 할 일** (3-1). 콘솔 맨 위에 승인 대기, 실패한 단계, 반영 안 한 배너, 침묵 경고를 한 줄씩. 각 줄이 그 탭으로 간다.
3. **런북 링크** (3-1). 수집 탭의 단계마다 `ROUTINE-SPEC.md` 그 단계 절로 가는 링크. `STEP_TITLES`에 앵커(문서 안 특정 절로 바로 가는 링크 꼬리) 이름을 한 칸 더 둔다.
4. **이력 탭** (3-2). `edits/`와 `proposals/*.result.json`을 한 목록으로. 편집 이력에 before 값을 넣는다(`ops_apply.py`가 적용 전 값을 같이 적는다).
5. (별도 트랙) **배너 문구 구조화** (설계 25). 편집기 폼이 금액 숫자, 기간 날짜 같은 구조 필드를 갖는다. 데이터 형식 결정이 먼저라 25를 다시 열어 정한 뒤 한다.
6. (별도 트랙) **사람별 계정** (설계 24의 첫 층). nginx htpasswd(Basic Auth 계정 목록 파일)에 사람별 항목, `X-Ops-User`로 누가를 채운다. 그 뒤에 22의 자동 반영 유예(저장하고 얼마 뒤에 자동으로 반영하되 그 사이에 되돌릴 수 있게 하는 것)를 콘솔에 얹는다.

## 6. 하지 않는 것

- 콘솔에 오퍼 원장(export.json) 편집을 넣지 않는다. 원장(수집한 값을 전부 적는 기준 장부, `log.jsonl`)은 수집 PC가 쓰고 `reflect_daily`(원장을 서버용 파일로 바꿔 올리는 스크립트)가 옮긴다. 두 곳에서 쓰면 사본이 갈린다.
- Spring API에 쓰기 경로를 열지 않는다(21).
- 문서를 콘솔에 복사해 넣지 않는다. 링크만.

## 출처

- 감사 로그 패턴: [AppMaster, Audit logging for internal tools](https://appmaster.io/blog/audit-logging-internal-tools-activity-feed), [AuditReady, Audit trail best practices](https://audit-ready.eu/en/blog/audit-trail-best-practices)
- 승인 흐름: [letmepost.dev, Building approval workflows](https://letmepost.dev/blog/approval-workflows), [Cflow, Approval workflow design patterns](https://www.cflowapps.com/approval-workflow-design-patterns/)
- 운영 대시보드: [Crystal Tech Ventures, Designing enterprise dashboards that operations teams actually use](https://crystaltechventures.com/designing-enterprise-dashboards-that-operations-teams-actually-use.php), [UXPin, Dashboard design principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/), [SRE School, Operational runbook](https://sreschool.com/blog/operational-runbook/)
- GitOps: [GitLab, What is GitOps](https://about.gitlab.com/topics/gitops/), [Atlassian, What is GitOps](https://www.atlassian.com/git/tutorials/gitops), [Liatrio, Just in time change approvals enabled by GitOps](https://www.liatrio.com/blog/just-in-time-change-approvals-enabled-by-gitops)
- 개발자 포털: [Backstage, What is Backstage](https://backstage.io/docs/overview/what-is-backstage/), [KodeKloud, What is Backstage](https://kodekloud.com/blog/backstage-the-open-source-developer-portal-transforming-how-engineering-teams-ship-software/), [Port, Backstage all you need to know](https://www.port.io/blog/backstage-all-you-need-to-know-about-this-developer-portal)
- 직접 만들기와 가져다 쓰기: [Retool, Web admin panel comparison](https://retool.com/blog/admin-panel-comparison), [State of Databases, Django admin vs Retool](https://stateofdb.com/vs/django-admin-vs-retool)
