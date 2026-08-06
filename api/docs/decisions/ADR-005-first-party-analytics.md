# ADR-005. 방문 측정은 외부 도구 없이 자체 서버에 익명으로 쌓는다

- 상태: 채택
- 날짜: 2026-07-29
- 관련: [tracker ADR-015](../../../delivery-discount-tracker/docs/decisions/ADR-015-open-access-only-and-disclosure.md)

## 맥락

어떤 화면이 실제로 쓰이는지 모르는 상태다. 기획서의 1차 목표가
"가설-실험-관찰-반영"인데 관찰 수단이 없어서 반영할 근거가 없다.
필요한 건 경로·재방문·체류·행동 네 가지다.

문제는 이 프로젝트가 방금 "비영리, 개인정보 안 다룸" 성격을 화면에
고지했다는 것이다(ADR-015). 여기에 GA4 같은 외부 분석 도구를 붙이면
**이용자 데이터가 제3자에게 넘어가고**, 그 사실을 다시 고지해야 하며,
쿠키 동의 문제까지 따라온다. 방금 줄인 위험을 다른 쪽에서 늘리는 셈이다.

## 결정

**자체 API로만 수집한다.** 외부 분석 도구를 쓰지 않는다.

- `POST /api/events` — 브라우저가 배치로 보내고 서버는 JSONL에 append
- 저장 위치는 원장과 같은 방식(`data/events.jsonl`), DB 없음
- 수집 항목: 이벤트명, 경로, 익명 visitorId/sessionId, 방문 회차,
  체류 시간, device(mobile/desktop), viewport, 유입 구분, 이벤트별 props

**개인 식별로 이어질 값은 애초에 받지 않거나 즉시 버린다.**

| 항목 | 처리 |
|---|---|
| 원본 IP | 저장 안 함. **날짜별 솔트 + 프로세스 난수 솔트**로 해시(`ClientFingerprint`) |
| UA 문자열 | 받지 않음. 클라이언트가 `mobile`/`desktop`만 보냄 |
| 유입 URL | 받지 않음. `direct`/`internal`/`external` 구분만 |
| 쿠키 | 안 씀. localStorage 난수 하나(사용자가 지우면 끊김) |
| DNT/GPC | 켜져 있으면 **아무것도 보내지 않음** |

IP 해시는 하루가 지나면 값이 바뀌고 서버를 재시작해도 바뀐다. 그날의
중복·과다 요청을 걸러낼 수는 있지만 사람을 날짜 넘어 추적할 수는 없다.

## 근거

- **제3자에게 안 넘기면 고지할 것도 적어진다.** "자체 서버에만 기록,
  외부 도구 없음"은 사실이라 그대로 쓸 수 있고, 이용자에게도 이해가 쉽다.
- **서버가 이미 있다.** OCI에 Spring + nginx가 떠 있어 추가 비용이 없다.
  외부 SaaS를 붙일 이유가 무료 한도 말고는 없었다.
- **JSONL이면 도구가 하나로 통일된다.** 원장(`log.jsonl`)과 같은 모양이라
  `jq` 한 줄이면 집계가 끝난다. 이 트래픽에서 DB는 과하다.

## 공개 쓰기 엔드포인트라서 건 것

인증이 없으므로 그대로 두면 디스크를 채워 넣을 수 있다.

- 이벤트명 화이트리스트 — 모르는 이름은 조용히 버림
- 배치 20건, 문자열 120자, props 6개 상한
- IP 해시별 분당 120건 (`EventRateLimiter`, 메모리 카운터)
- 깨진 본문은 예외 대신 `accepted: 0`

## 함정 — sendBeacon은 application/json을 못 쓴다

체류 시간은 페이지가 닫히는 순간 나온다. 그 시점엔 `fetch`가 취소되므로
`navigator.sendBeacon`을 써야 하는데, **비콘을 `application/json`으로
보내면 CORS 프리플라이트가 걸리고 비콘은 프리플라이트를 못 해서 아무
경고 없이 그냥 사라진다.** 실제로 이 방식으로 체류 데이터가 통째로
유실되는 걸 확인했다.

그래서 비콘은 `text/plain`으로 보내고(단순 요청이라 프리플라이트 없음),
서버는 본문을 문자열로 받아 직접 파싱한다. 이 계약이 깨지면 체류 데이터가
소리 없이 사라지므로 `EventControllerTest`가 못박는다.

## 집계

```bash
# 일별 방문
jq -r 'select(.event=="page_view") | .ts[0:10]' events.jsonl | sort | uniq -c

# 재방문 비율
jq -r 'select(.event=="page_view") | if .visitCount>1 then "재방문" else "신규" end' \
  events.jsonl | sort | uniq -c

# 중위 체류 시간(초)
jq -r 'select(.event=="page_exit") | .dwellMs' events.jsonl \
  | sort -n | awk '{a[NR]=$1} END{print a[int(NR/2)]/1000}'

# 많이 열어본 브랜드
jq -r 'select(.event=="brand_expand") | .props.brand' events.jsonl | sort | uniq -c | sort -rn | head

# 실제로 앱으로 넘어간 클릭
jq -r 'select(.event=="offer_link_click") | "\(.props.platform)\t\(.props.brand)"' \
  events.jsonl | sort | uniq -c | sort -rn | head
```

## 뒤집을 조건

- **트래픽이 늘어 JSONL 집계가 느려지면** DB로 옮긴다. 지금은 파일 한 줄
  읽기로 충분하다.
- **인스턴스를 늘리면** 메모리 레이트리미터가 각자 세므로 공유 저장소가
  필요해진다.
- **수익화하면** 광고 목적 이용이 아니라는 고지가 거짓이 되므로 ADR-015와
  함께 다시 본다.

**(2026-07-30 갱신)** 위 "재방문 비율" 집계는 `visitCount`가
`localStorage` 기반이라 삭제·기기 변경에 취약하다는 한계가 실제로
드러났다. 프론트(delivery-discount-web)에서 재방문 측정 정확도만을
목적으로 GA4를 임시로 병행 도입했다 — 이 ADR의 "외부 도구 없이" 원칙에
대한 한정적 예외이며, 배경·범위·제거 조건은
[delivery-discount-web ADR-002](../../../delivery-discount-web/docs/decisions/ADR-002-temporary-ga4-for-revisit-accuracy.md)
참고. 여기 문서화된 자체 수집 파이프라인(`/api/events`)은 그대로 유지되고
바뀐 것이 없다.

## 검증 한계

배포된 엔드포인트는 `application/json`과 `text/plain` 양쪽으로 확인했고
서버 로그에 정상 기록된다. 다만 **브라우저의 `sendBeacon` 실제 전송은
자동화된 Chrome(CDP 제어)에서 재현되지 않아 검증하지 못했다** — 큐잉은
`true`를 반환하는데 요청이 나가지 않는다. 서버 수용은 확인됐으므로
실기기에서 체류 데이터가 쌓이는지 한 번 확인이 필요하다.
