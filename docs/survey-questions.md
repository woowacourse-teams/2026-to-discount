# 설문 문항 수정 방법

설문은 기프티콘 지급과 별개로, 서버가 "이 방문자에게 배너를 띄울지"만
판정한다. 문항 내용은 프론트 파일 하나로 관리한다.

## 뜨는 순서 (기프티콘 조건과 무관)

1. `web/src/App.jsx`가 페이지가 뜨자마자 `GET /api/survey?visitorId=...`로
   묻는다. 서버가 `eligible: true`를 주면 `surveyOn`이 켜진다.
2. 켜지면 화면 우측 하단에 `SurveyDock.jsx`의 알약 배너가 뜬다
   ("어떻게 쓰고 계신가요?"). 이 시점엔 아직 질문 내용이 안 보인다.
3. 배너를 누르면 `SurveyCard.jsx`가 펼쳐진다 — 여기서 실제 문항이
   보인다.
4. 첫 섹션에 답하면 "보내고 쿠폰 받기"가 눌린다. 나머지 섹션들은
   답 안 해도 보낼 수 있다(첫 섹션만 필수).
5. 서버가 응답을 받고 원장에 적은 뒤 기프티콘 코드를 돌려주면 카드가
   "고맙습니다" 화면으로 바뀐다.

**즉 "질문 내용"이 뜨는 조건은 두 겹이다.** ①서버가 대상이라고 답해야
배너 자체가 뜨고, ②그 배너를 사용자가 눌러야 문항이 보인다. 기프티콘
재고나 지급 여부는 이 과정과 무관하다 — 재고가 없어도 문항은 뜬다
(재고 판정은 "보내기"를 눌렀을 때만 걸린다).

### 로컬에서 강제로 띄우기 (개발자 테스트)

대상 판정을 건너뛰려면 서버 환경변수
`DISCOUNT_SURVEY_TEST_VISITORS`에 자신의 visitorId를 넣는다
(콤마로 여러 명). 이 목록에 있으면 접속일·전환수 조건 없이
`eligible: true`가 나온다 — 재고가 0이어도 배너가 뜬다.

```bash
# 서버(systemd)에 임시로 심는다. 개발자 세션이 끝나면 지운다.
ssh <REMOTE> "sudo systemctl edit discount-api"
# [Service]
# Environment=DISCOUNT_SURVEY_TEST_VISITORS=<내visitorId>
ssh <REMOTE> "sudo systemctl restart discount-api"
```

브라우저 콘솔에서 `localStorage.getItem('dk_visitor_id')`로 자신의
visitorId를 확인한다. 이미 한 번 응답했거나 두 번 닫았으면
`localStorage.removeItem('dk_survey_dismissed')`,
`localStorage.removeItem('dk_survey_answered')`로 초기화한다.

## 문항 고치는 파일

`web/src/surveyQuestions.js` 하나만 고치면 된다. 다른 파일은
건드릴 필요 없다.

```js
export const REWARD_NOTICE = '응답해 주시면 배민 1,000원 쿠폰 지급'   // 배너 알약 안내

export const SECTIONS = [
  {
    id: 'purpose',          // 원장 키 접두사. 바꾸면 이전 응답과 안 이어진다
    primary: true,          // 첫 섹션 표시 — 딱 하나여야 한다
    title: '이 서비스를 왜 쓰시나요?',
    other: true,            // '직접 입력' 칸을 붙일지
    options: [
      { token: 'discount_info', label: '할인 정보 보려고' },
      // ...
    ],
  },
  // 나머지 섹션도 같은 모양 — 최대 5개까지 (카드가 화면당 하나씩
  // 넘기는 캐러셀이라, 그 이상은 중도 이탈이 늘어난다)
]
```

### 뭘 물을지 고르는 기준

- **우리가 이미 아는 건 안 묻는다.** 주 이용 플랫폼처럼 클릭·링크
  이동으로 로그에 이미 잡히는 값은 설문에서 빼야 한다 — 물어봐도
  중복 확인일 뿐이고, 그 자리만큼 진짜 궁금한 것을 못 묻는다.
- **직접 답해야만 아는 것만 남긴다.** 쓰는 이유·시점, 뭘 중시하는지,
  뭘 바라는지처럼 로그를 아무리 들여다봐도 안 나오는 것.
- **"딱히 없다"류 선택지를 넣지 않는다.** 정보값이 없는 답을 고르는
  자리 하나가 늘 뿐이고, 그만큼 진짜 답의 응답률이 깎인다. 정말 할
  말이 없으면 그냥 그 섹션을 건너뛰면 된다(첫 섹션 말고는 필수가
  아니다) — "없다"를 굳이 선택지로 만들 필요가 없다.

### 할 수 있는 것

- **문구만 바꾸기**: `label`, `title`, `REWARD_NOTICE`를 고친다. 안전하다.
  바로 반영된다.
- **선택지 추가/삭제**: `options` 배열에 `{ token, label }`을 더하거나
  뺀다. 단, **첫 섹션(`primary: true`)의 토큰은 서버 화이트리스트에도
  있어야 한다** — 아래 "첫 섹션 토큰을 바꿀 때" 참고. 둘째·셋째
  섹션은 서버가 값을 그대로 받아 적으므로 프론트만 고치면 된다.
- **섹션 추가**: `SECTIONS` 배열에 새 객체를 더한다. `id`는 다른
  섹션과 안 겹치는 영문 소문자+숫자+밑줄(예: `time_of_day`)로 짓는다 —
  이 값이 원장 컬럼명(`q_<id>`)이 된다.
- **섹션 삭제**: 배열에서 지우면 된다. 이미 쌓인 원장 줄에는
  그 섹션 답이 남아 있으니, 집계 스크립트를 그 컬럼에 의존하게
  짜지 않는다.

### 하면 안 되는 것

- **이미 쓰던 토큰의 뜻을 바꾸기**: `discount_info`를 "정보 보려고"에서
  "쿠폰 찾으려고"로 재활용하면 이전 응답과 새 응답이 같은 토큰 아래
  섞여 집계가 틀어진다. 뜻이 바뀌면 새 토큰을 쓴다.
- **`primary: true`를 두 섹션에 걸기**: 프론트가 그중 나중 것만 쓰고
  나머지는 무시한다 — 렌더는 안 깨지지만 필수 문항이 헷갈린다.

### 첫 섹션 토큰을 바꿀 때

첫 섹션 값만 서버가 검증한다(`SurveyService.CHOICES`,
`api/src/main/java/com/discounttracker/analytics/SurveyService.java:32`).
토큰을 추가/삭제하려면 그 줄의 `Set.of(...)`도 같이 고치고 API를
재배포한다. 안 맞추면 서버가 `400 Bad Request`로 거절한다.

## 반영 방법

- **프론트만 고쳤을 때** (문구, 둘째·셋째 섹션 선택지 추가): 모노
  저장소에 커밋 후 `main`에 푸시하면 `mirror-deploy-repos.yml`이
  `nn98/delivery-discount-web`으로 미러하고 Vercel이 자동 배포한다.
  API 재배포는 필요 없다.
- **첫 섹션 토큰을 바꿨을 때** (서버 화이트리스트도 고침): 위와
  같이 푸시하되, API도 재배포해야 한다 — 서버가 옛 토큰 목록으로
  떠 있으면 새 토큰이 전부 400으로 튕긴다.

  ```bash
  ssh <REMOTE> "cd delivery-discount-api && git pull && ./gradlew build -x test"
  ssh <REMOTE> "sudo systemctl restart discount-api"
  ```

- **로컬에서 눈으로 먼저 보기**: `web`에서 `npm run dev` 띄우고
  `http://localhost:5173`에서 확인한다. `/api`는 vite 프록시가
  실제 서버로 넘기므로 API를 로컬에 띄울 필요 없다.

## 관련 파일

| 파일 | 역할 |
|---|---|
| `web/src/surveyQuestions.js` | 문항 정의 — **여기만 고치면 됨** |
| `web/src/SurveyCard.jsx` | 펼친 카드를 그린다. 섹션을 순회해 렌더만 함 |
| `web/src/SurveyDock.jsx` | 우측 하단 배너(펼치기 전) |
| `web/src/App.css` | `.survey-*` 클래스. 머리 띠 색은 `.survey-header` |
| `api/.../SurveyController.java` | `POST /api/survey` — `choice`(필수) + `answers`(선택) |
| `api/.../SurveyService.java` | 첫 섹션 화이트리스트(`CHOICES`), 원장 기록 |
| `api/.../SurveyText.java` | 자유 입력에서 주민번호·전화번호·이메일 제거 |
| `api/.../PostHogEventMapper.java` | `*_text` 키는 PostHog로 안 내보냄 |
