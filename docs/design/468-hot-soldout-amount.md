# 468. 인기 순위(HOT) 줄: 소진만 남은 브랜드 금액을 취소선과 "소진"으로

이슈: [#468](https://github.com/woowacourse-teams/2026-to-discount/issues/468). 범위: `web/`만. 원장과 API는 건드리지 않는다.

## 문제

`web/src/PopularDock.jsx` `Cells`가 `displayBestAmount(offers, { menu: true })`로 금액을 구한다. `displayBestAmount`(`web/src/filters.js` 571행)는 `!o.soldOut`인 오퍼만 보므로, 오퍼가 전부 소진인 브랜드(2026-11-26 운영: 60계치킨, 지코바, 피나치공)는 null이 나오고 금액 칸이 빈 문자열이 된다. 카드와 칩(`OfferChip.jsx` 83~84행)은 소진 금액을 `<s className="offer__amount--soldout">`와 "품절"로 보인다.

## 결정 (사용자 2026-11-26: A안)

1. **금액 우선순위.** 먼저 지금처럼 `displayBestAmount(offers, { menu: true })`. null이면 소진 오퍼 중 같은 포함 규칙(`comparable(o, { menu: true })`, `amount != null`, `soldOut === true`)을 지나는 것의 액면 최댓값. 그것도 없으면 지금처럼 빈 칸.
   - 살아 있는 오퍼가 하나라도 있으면 소진 금액이 더 커도 살아 있는 금액을 보인다(지금 동작 유지). 순위 줄은 "지금 받을 수 있는 최고"다.
2. **오픈 전.** 오픈 전 오퍼는 `soldOut`이 아니므로 `displayBestAmount`가 이미 센다. 이번에 바꾸지 않는다. "소진과 오픈 전이 섞인" 브랜드는 오픈 전 금액이 평문으로 나온다(지금과 같음).
3. **새 함수.** `filters.js`에 `displaySoldOutAmount(offers, include = false)`를 `displayBestAmount` 바로 아래에 둔다. 포함 규칙을 `comparable` 하나로 공유해 두 함수가 갈라지지 않게 한다. `displayBestAmount`의 반환값과 의미는 바꾸지 않는다(정렬, 최고 표시, 숨기기가 쓴다).
4. **그리기.** 소진 금액일 때 `pop-dock__amount` 안에 `<s className="offer__amount--soldout">8,000원</s><span className="pop-dock__soldout">소진</span>`. 취소선 스타일은 카드와 같은 클래스를 재사용한다. 라벨 크기·색은 `pop-dock__soldout`에 칩의 `offer__soldout-label`과 같은 톤으로 둔다(접힌 한 줄 폭 360px에서 이름이 먼저 말줄임되고 금액 칸은 줄지 않게, 기존 `pop-dock__amount`의 flex 규칙을 따른다).
   - 라벨 문구는 이슈 결정대로 "소진"(칩은 "품절"). 같은 화면 안의 HOT 줄과 배너("오늘 소진")에 맞춘다.
5. **스크린 리더.** 행 버튼의 `aria-label`이 내용을 덮으므로 소진이면 `${rank}위 ${name} 소진 카드로 가기`로 넣는다. 소진이 아니면 지금 문구 그대로.
6. **`App.jsx` `bestOf`(숨기기) 범위 밖.** `bestOf`는 `applyHidden`과 `revivedNames`가 "숨긴 뒤 금액이 올랐나"를 비교하는 값이다. 소진 금액을 섞으면 소진→재입고가 아닌데 되살아나는 판정이 달라진다. 이번에는 손대지 않는다.

## 번지는 범위

`docs/CHANGE-PROPAGATION.md`에 HOT 줄이나 `displayBestAmount` 묶음은 없다. `displayBestAmount`를 바꾸지 않고 새 함수를 더하므로 정렬, 카드 큰 글씨, 숨기기는 그대로다. 접힌 줄과 펼친 목록은 같은 `Cells`를 쓰므로 한 자리 수정이다.

## 고칠 자리

- `web/src/filters.js`: `displaySoldOutAmount` 추가.
- `web/src/PopularDock.jsx`: `Cells`에서 금액·소진 판정, 버튼 `aria-label`에 "소진". 판정은 `Cells`와 버튼이 같이 쓰도록 행 단위로 한 번 계산한다(예: `rowAmount(brand) → { amount, soldOut }`).
- `web/src/index.css`(또는 HOT 줄 스타일이 있는 파일): `.pop-dock__soldout`.

## 시험

- `web/src/filters.test.js`(있는 파일에 추가): 소진만 → 소진 최댓값, 살아 있는 것과 섞임 → null(살아 있는 쪽은 `displayBestAmount`), 금액 없는 소진 → null.
- `web/src/popularDock.test.js` 신규(`offerChip.test.js`처럼 esbuild 번들 + `renderToStaticMarkup`): 소진만 남은 브랜드를 넣으면 `<s class="offer__amount--soldout">8,000원</s>`과 "소진"이 있고 `aria-label`에 "소진"이 있다. 소진 아닌 브랜드는 `<s>`가 없고 금액이 평문이다. 오퍼 없는 브랜드는 금액 칸이 비어 있다(양성 신호: 같은 렌더에 브랜드 이름이 있음을 먼저 확인).
- 새 테스트 파일이 `web/scripts/run-node-tests.mjs`가 집는 이름 규칙에 드는지 확인하고, 안 들면 `web/package.json` `test`에 넣는다.

## 확인

`preview/<이름>`으로 올려 360px 스크린샷으로 HOT 줄 접힘과 펼침을 받은 뒤 main에 병합한다.
