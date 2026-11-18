# /insight 사용자 반응(E) 집계

이슈 #403 2단계. 운영 콘솔 탭에서 보는 관리자용 집계다. 공개 `/insight`에는 싣지 않는다.

## 만드는 법

`python3 scripts/insight_behavior.py --out behavior.json`. 원장(`events.jsonl`)을 `experiments.load/keep`으로 읽어 snapshot.py와 같은 방문자 거르기(개발, 봇, 합성)를 쓴다. API `GET /api/admin/insight/behavior`가 이 파일을 운영 콘솔 인증 뒤에서 그대로 내려준다(위치는 `DISCOUNT_BEHAVIOR_PATH`, 비우면 이벤트 원장과 같은 폴더의 `behavior.json`).

## 싣는 것

| 이름 | 뜻 |
|---|---|
| `weeklyClicks` | 앱별 주간 클릭 수(카드 칩과 배너 합). 주는 월요일 시작. `topBrands`는 그 주 카드 칩 클릭 1등 브랜드(`all`은 앱 합, 앱별은 그 앱, 없으면 null) |
| `topBrandsTotal` | 전체 기간 카드 칩 클릭 1등 브랜드. 키는 `topBrands`와 같다 |
| `platformReaction` | 앱별 클릭 수, 클릭한 사람 수, 배너 노출, 배너 클릭, 배너 닫음과 그 비율 |
| `brands` | 카드 칩 클릭 상위 30개 브랜드. 클릭, 클릭한 사람, 노출, 펼침, 배너 클릭, 담기, 클릭률 |
| `funnel` | 방문, 브랜드 노출, 앱 이동 단계별 사람 수. 펼침은 뺐다(칩을 바로 눌러 나가는 길이 있어 단계가 겹치지 않는다) |

## 읽는 법

- 비율은 분모가 30 미만이거나 분자가 분모보다 크면 `null`이다. 노출 이벤트가 클릭보다 적게 잡히는 칸이 있다.
- 브랜드 클릭률의 분모는 카드 노출이라 배너 클릭은 따로 센다(`bannerClicks`).
- 노출과 클릭은 이벤트 건수이고 사람 수가 아니다. 클릭한 사람은 `clickers`.
- **앱 열림 성공률은 싣지 않는다**(2026-11-18 사용자 결정).
- 정렬 위치가 클릭을 좌우한다(banner_order_analysis 한계와 같다). 브랜드 클릭률을 브랜드 인기로 곧장 읽지 않는다.
