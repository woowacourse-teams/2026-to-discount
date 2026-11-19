<!-- 원본: tracker docs/specs/issue-25-coupangeats-no-fallback-link.md — 여기서 고치지 않는다 -->
# 설계: 쿠팡이츠 예비 공유 링크를 내보내지 않고 웹 기본값에 맡김 (이슈 #25)

- 상태: 설계 (구현 전)
- 영역: **export** (폰 불필요)
- 읽은 것: `export_data.py` `build_export`(380~520행)와 `main`(803~828행), `docs/specs/issue-10-coupangeats-offer-link-rule.md`, `tests/test_coupangeats_hub_tabs.py`, `tests/test_export_data_stdout.py`, mono `web/src/offerLink.js`(읽기용), `mono/docs/CHANGE-PROPAGATION.md`.

## 1. 지금 코드가 하는 일

- `build_export`는 쿠팡이츠 오퍼에 사람 링크나 이번 주 탭 링크가 있을 때만 `link`를 싣는다. 없으면 키를 싣지 않는다(탭 링크가 지난 주차면 `item.pop("link", None)`, 506행). **"링크 없음"의 기존 산출물 형식은 키 생략**이다.
- `main()` 820~826행이 그 뒤에 사람 링크 브랜드가 아니고 `coupangeats://`로 시작하지 않는 쿠팡이츠 오퍼 전부에 `CE_OFFER_FALLBACK_LINK`(175행)를 채운다. 이 상수는 `main()`의 유효성 확인(`share_link_fresh`) 대상이 아니다. 확인 대상은 `COUPANGEATS_LINK`(`share_link()`)뿐이다.
- 웹 `offerLink.js` 175행은 지금 `coupangeats://`가 아니면 `COUPANGEATS_LINK`로 연다. mono #143이 병합되면 `https://share.coupangeats.com/`로 시작하는 오퍼 링크를 그대로 쓴다. 그 뒤에는 상수가 만료돼도 오퍼가 지난 허브를 연다(2026-10-12 사고).

## 2. 결정

### 2.1 `main()`의 채우기 제거, 링크 없음은 키 생략

- `item["link"] = CE_OFFER_FALLBACK_LINK`를 없앤다. 쿠팡이츠 오퍼 중 사람 링크도 이번 주 탭 링크도 없는 것은 `link` 키가 **없다**(`build_export`가 이미 내는 모양 그대로. `None`을 새로 만들지 않는다. 웹의 `offer.link?.startsWith`와 `!!offer.link`가 둘 다 처리하지만, 키 생략이 이미 산출물에 있는 형식이라 소비자가 하나만 안다).
- `CE_OFFER_FALLBACK_LINK` 상수와 앞의 주석 두 줄(173~174행)을 지운다. 코드와 `tests/`에 쓰는 곳이 없다(grep 결과 `export_data.py` 두 곳뿐). 이슈 #10 설계 문서는 기록이라 고치지 않는다.
- 계수는 그대로 둔다. "공유 N"은 "링크 없음(웹 기본) N"이라는 뜻으로 센다. 출력 줄을 `쿠팡이츠 링크: 사람 N / 이번 주 탭 N / 웹 기본 N / 지난 주차 제거 N`로 바꿀지는 아래 7번에서 묻는다. 기본안은 **글자 `공유`를 `웹 기본`으로 바꾼다**. 이유: 내보내기가 더는 공유 링크를 싣지 않는데 "공유"라고 찍으면 읽는 사람이 실렸다고 오해한다. `tests/test_export_data_stdout.py`의 문자열은 인코딩 시험용 임의 문장이라 줄 형식과 무관하다.

### 2.2 `main()` 블록을 함수로 뺀다

지금 이 블록은 `main()` 안에 있어 직접 시험할 수 없다(`main()`은 네트워크 `share_link_fresh`를 부르고 원장과 파일을 쓴다). 결론을 테스트로 박으려면 시험할 자리가 필요하다.

- `export_data.py`에 `count_default_link_offers(exported, human_brands) -> list[str]`를 둔다. 쿠팡이츠 오퍼 중 사람 링크 브랜드가 아니고 `coupangeats://` 링크가 없는 것의 브랜드 이름 목록을 돌려준다. **오퍼를 고치지 않는다**(읽기 전용 셈). `main()`은 길이만 출력에 쓴다.
- 대안으로 `main()`을 monkeypatch로 통째로 돌리는 테스트도 가능하나, `share_link_fresh` 네트워크, `LOG_PATH`, `SEEN_PATH`, `EXPORT_PATH`, `BRANDS_PATH`를 모두 가려야 해 깨지기 쉽다. 함수로 빼는 쪽을 택한다.

## 3. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에 쿠팡이츠 오퍼 링크 줄은 없다(`쿠팡이츠`가 든 줄은 126행 `ce_min_order` 하나, 링크와 무관). 코드에서 직접 쟀다.

| 자리 | 넣는가 | 이유 |
| --- | --- | --- |
| `export_data.py` `main`, `CE_OFFER_FALLBACK_LINK` | 넣는다 | 이슈 본문 |
| `tests/test_coupangeats_hub_tabs.py` 또는 새 `tests/test_coupangeats_default_link.py` | 넣는다 | 끝 조건 테스트 |
| `scripts/offer_link_check.py` | 확인만 | `offer["link"]`을 읽는다. 링크 없는 쿠팡이츠 오퍼를 "죽은 링크"나 "점검 대상 없음"으로 세지 않는지 읽는다. 키가 없는 오퍼는 이미 탭 링크가 없을 때 나오던 모양이라 변경 없음 예상 |
| `capture/coupangeats_share.py` | 안 넣는다 | 웹이 쓸 `COUPANGEATS_LINK`의 확인은 그대로 |
| mono `web/src/offerLink.js` (`COUPANGEATS_LINK` 폴백) | 안 넣는다 | 읽기용 체크아웃. 링크 없음이면 지금도 175행이 `COUPANGEATS_LINK`로 연다 |
| mono `fromBanner: !!offer.link` (199행) | 안 넣는다, **알린다** | 아래 4번 |
| 원장 `data/log.jsonl` | 안 건드린다 | 아래 5번 |

**병합 순서.** 이 변경은 mono #143과 **순서가 없다**. 어느 쪽이 먼저여도 웹이 연 링크가 같다.

- tracker가 먼저(링크 없음): #143 전, 후 모두 웹이 `COUPANGEATS_LINK`로 연다.
- mono #143이 먼저, tracker가 나중: 그 사이 오퍼 링크가 예비 상수로 실려 웹이 그걸 연다. 이 틈이 이 이슈가 닫으려는 위험이다. 그래서 **tracker를 먼저 병합하는 편이 안전**하다.

## 4. 알려야 할 부작용: `fromBanner`

`offerLink.js` 199행 `fromBanner: !!offer.link`는 클릭 분석 속성이다. 지금은 모든 쿠팡이츠 오퍼에 링크가 실려 `fromBanner`가 거의 항상 `true`다. 변경 뒤에는 링크 없는 오퍼가 `false`다. 대시보드가 이 키를 가르는 값으로 쓰면 병합 날부터 구간이 끊긴다. 이 PR에서 고치지 않는다(mono, 별도). PR 본문 후속 조치에 mono 확인 항목으로 올린다. **미확인**: PostHog 대시보드가 `fromBanner`를 쓰는지는 이 저장소에서 볼 수 없다.

## 5. 원장 append-only

원장을 읽기만 한다. 쓰지 않는다. 바뀌는 것은 `export.json` 한 파일(파생물)의 `link` 키 유무다. `seen.json`(`apply_first_seen`)은 `link`를 키로 쓰는지 구현자가 읽어 확인한다. 쓰면 링크 값이 바뀌는 순간 선착순 표식이 다시 서는 사고(AGENTS.md가 말한 선착순 표식 사고)가 될 수 있다. 현재 읽은 범위에서는 쓰지 않는 것으로 보이나 **확인하지 않았다**.

## 6. "없다 / 0 / 통과"의 양성 신호

| 자리 | 지금 "없다"가 뜨는 때 | 양성 신호 |
| --- | --- | --- |
| 링크 없음(웹 기본) 수 | 허브 수집이 실패해 이번 주 탭이 0건인 날도, 정말 허브에 없는 브랜드도 똑같이 "링크 없음"이 된다 | 기존 경고 `이번 주(MMDD) 허브 탭 0건 - 허브를 못 읽었을 수 있다`(445행)를 그대로 두고, **출력 줄에도 같이 찍는다**. 줄만 보고 "웹 기본 35"를 정상으로 읽지 않게 한다. 이슈 #10 설계 5번 표와 같은 원칙 |
| 웹이 링크 없음을 받아 `COUPANGEATS_LINK`를 연다 | 내보내기 쪽에서는 보이지 않는다 | `main()`의 `share_link_fresh`가 `COUPANGEATS_LINK`가 이번 주 허브인지 매 수집 때 확인한다(812~814행). 이 PR 뒤에는 **링크 없는 모든 쿠팡이츠 오퍼가 이 하나의 확인에 기댄다**. 이 확인이 `RuntimeError`로 배포를 막는 동작을 바꾸지 않는다는 것을 아래 T4가 박는다 |
| 쿠팡이츠 오퍼에 `https://share.coupangeats.com/` 링크가 실림 | 사람 링크는 의도, 그 밖은 예비 상수가 샌 것 | 사람 링크 브랜드 밖에서 `share.coupangeats.com` 링크가 나가면 실패(T2) |

## 7. 테스트 (결론을 박는 곳)

`tests/test_coupangeats_hub_tabs.py`에 추가한다(같은 모듈의 `_export`, `_hub_row`, `_box_row` 도우미를 쓴다). 이름은 구현자가 정한다.

- **T1 끝 조건 1, 링크 없음**: 이번 주 탭도 사람 링크도 없는 쿠팡이츠 오퍼(쿠폰함 행만 있는 원장)를 `build_export` 한 결과에 `link` 키가 없다. `count_default_link_offers`가 그 브랜드를 돌려준다. 옛 코드에서는 `main`이 채워 이 함수가 존재하지 않으므로 먼저 빨갛게 확인한다.
- **T2 상수 부재**: `export_data`에 `CE_OFFER_FALLBACK_LINK` 속성이 없다(`hasattr` 거짓). 소스 문자열에 `share.coupangeats.com/9hxKHM87k7b` 리터럴이 없다. 이슈 #10 T6의 같은 취지(상수 박제 금지)이며, 만료된 값이 되살아나는 것을 막는다.
- **T3 끝 조건 2, 있는 것은 그대로**: 사람 링크가 있는 오퍼와 이번 주 탭 링크가 있는 오퍼는 `link`가 각각 그 값이다. 기존 `test_coupangeats_hub_tabs.py` 196~209행 단언이 이미 덮으므로 **새로 쓰지 않고 통과만 확인**한다. 수가 줄었는지(`사람 N / 이번 주 탭 N`) 보는 단언은 `count_default_link_offers`에 사람 브랜드를 넘겨 그 브랜드가 목록에서 빠지는지로 박는다.
- **T4 유효성 확인 유지**: `share_link_fresh`가 `(False, key)`를 돌려주면 `main()`이 여전히 `RuntimeError`를 던진다. `share_link`, `share_link_fresh`를 monkeypatch하고 `read_records`를 빈 목록으로 두어 확인 직후 터지는 것만 본다(`tests/test_export_data_stdout.py`의 `read_records` monkeypatch와 같은 방식).
- **T5 출력 줄**: `main()`이 찍는 `쿠팡이츠 링크:` 줄에 `웹 기본` 수가 들어간다(2.1의 기본안을 택했을 때). `capsys`로 본다. 파일 쓰기를 `tmp_path`로 돌려야 하면 T4와 합치지 않고 `count_default_link_offers` 단위 시험으로 대신한다.

## 8. 사용자에게 물을 것 (구현 전 확인)

- 출력 줄의 `공유` 글자를 `웹 기본`으로 바꿔도 되는가. 이슈 본문은 "공유 수를 그대로 셈"이라고만 적었고 글자를 바꾸라고는 하지 않았다. 바꾸지 않아도 끝 조건은 충족한다. 이 설계는 오해 방지를 위해 바꾸는 쪽을 기본으로 둔다.
- `fromBanner` 분석 키(4번)가 mono 대시보드에 쓰이는지.

## 9. 하지 않는 것

1. mono `offerLink.js`와 `fromBanner` 수정(mono, 프리뷰 먼저 규칙).
2. `COUPANGEATS_LINK` 값의 주차 관리 방식 변경. 이슈 결정은 "공유 링크 값은 웹 상수로 관리"이다.
3. `export.json`에 `link: null`을 새로 싣는 것.

## 10. 범위 점검

한 PR에서 리뷰 가능한 크기다: `export_data.py`에서 상수 삭제, 블록을 함수로 추출, 출력 한 줄. 테스트 다섯 중 둘은 기존 단언 확인이다. 영역은 폰이 필요 없는 `export`이다.
