# 새 세션용 프롬프트 — 배민 브랜드관 캡처 판독 (2026-08-10)

아래 내용을 그대로 새 세션에 붙여넣으면 된다.

---

배민 브랜드관 스크롤 캡처 3장을 판독해서 브랜드별 할인 목록을 뽑아줘.

## 작업 저장소

```
C:\Users\soldesk\IdeaProjects\delivery-discount-tracker\.claude\worktrees\brand-detail-collection
```

원본 저장소의 워크트리다. **작업 시작 전에 뒤처졌는지 확인할 것**
(`git fetch origin && git log --oneline HEAD..main`) — 낡은 워크트리에서
이미 있는 기능을 다시 구현한 사고가 있었다. 근거는
`docs/decisions/ADR-018-original-repo-is-the-working-copy.md`.

## 입력

```
C:\Users\soldesk\IdeaProjects\delivery-discount-tracker\ref\delivery\2026-08-10\
  baemin (1).jpg   1220 x 19986
  baemin (2).jpg   1220 x 23953
  baemin (3).jpg   1220 x 11533
```

폰의 스크롤 캡처 기능으로 사람이 찍은 것이다. 화면은
`브랜드관 > 오늘의 할인` 탭이고 `가까운 가게만 보기`는 꺼져 있다.

**세로로 길어서 통째로 읽으면 글자가 뭉개진다.** 1900px씩 잘라서 읽는다.
이미 잘라둔 결과가 `captures/bm0810/`에 31개 있다(`baemin1_00.png` …).
다시 만들려면:

```python
from PIL import Image
from pathlib import Path
src = Path(r"C:\Users\soldesk\IdeaProjects\delivery-discount-tracker\ref\delivery\2026-08-10")
out = Path("captures/bm0810"); out.mkdir(parents=True, exist_ok=True)
for f in sorted(src.glob("*.jpg")):
    im = Image.open(f); W, H = im.size
    tag = f.stem.replace(" ", "").replace("(", "").replace(")", "")
    for i, top in enumerate(range(0, H, 1900)):
        im.crop((0, top, W, min(top + 1900, H))).save(out / f"{tag}_{i:02d}.png")
```

조각을 Read 도구로 하나씩 열어 읽는다. 채팅에 이미지를 붙여 넣으면
축소돼 금액이 안 읽히므로 **반드시 파일 경로로 읽을 것**.

## 뽑을 것

카드 한 장에서 **브랜드명 + 할인 종류별 금액**. 카드는 이렇게 생겼다.

```
마선생얼큰국밥  [쿠폰]
불법 약물 근절 운동 동참으로 …
% 3,500원 브랜드 할인
```

```
잠바주스  [쿠폰]
리얼 과일 스무디/과채 주스 전문 브랜드
% 2,000원 첫주문 할인
% 3,500원 브랜드 할인
```

**첫주문 할인과 브랜드 할인은 다른 값이다. 섞지 말 것.**
- 한 카드에 둘 다 있을 수 있다.
- 첫주문만 있는 카드도 있다.
- `10% 브랜드 할인`처럼 정률인 카드도 있다 — 원이 아니라 %다.

이 구분이 중요한 이유는 `docs/decisions/ADR-017-ddangyo-subtract-first-order-coupon.md`
에 있다(땡겨요에서 첫주문 쿠폰을 빼고 기록하기로 한 근거). 배민도 같은
문제가 있으므로 종류를 살려서 적는다.

## 결과 형식

`captures/baemin_lounge_2026-08-10.txt` 에 탭 구분으로.

```
브랜드명<TAB>브랜드할인<TAB>첫주문할인
마선생얼큰국밥	3500	-
잠바주스	3500	2000
커피앳웍스	10%	-
```

- 값이 없으면 `-`
- 정률이면 `10%`처럼 단위를 그대로
- **읽히지 않는 글자는 추측하지 말고 `?`로 두고 따로 목록에 적을 것**
  (`docs/decisions/ADR-003-vision-over-selectors.md`, ADR-004의 "수식어를
  지어내지 않는다" 원칙)

## 먼저 읽을 문서

| 문서 | 왜 |
|---|---|
| `docs/GLOSSARY.md` | "카드"가 세 가지를 가리킨다. 여기서 읽는 건 **앱 브랜드 카드** |
| `docs/decisions/ADR-003-vision-over-selectors.md` | 비전 판독을 쓰는 이유와 한계 |
| `docs/decisions/ADR-004-preserve-qualifier.md` | `최대` 같은 수식어를 임의로 정규화하지 않는다 |
| `docs/decisions/ADR-005-main-page-only.md` | 수집 범위. 브랜드관은 범용 할인 쪽 메인이다 |
| `docs/decisions/ADR-008-manual-fallback-parity.md` | 수동 캡처 산출물이 자동과 같은 계약을 따른다 |
| `docs/decisions/ADR-013-manual-capture-scope-freeze.md` | 배민 자동 스크롤 캡처를 접은 이유 |
| `parse/CONTRACT.md` | 무엇을 레코드로 만들고 무엇을 버리는지 |

## 하지 말 것

- **원장(`data/log.jsonl`)에 넣지 말 것.** 판독 결과 파일만 만든다.
  넣는 것은 `ingest.py`가 하는 별도 작업이고, 사람이 대조한 뒤에 한다.
- `export_data.py`를 돌리지 말 것.

## 참고 — 지금 알고 있는 사실

- 배민 프로모션은 **월요일 00시에 갱신된다**(2026-08-10 확인). 이 캡처는
  갱신 직후 찍은 것이다.
- 접근성 트리로 같은 목록을 긁어봤지만 가상 스크롤 때문에 34건에서
  멈춘다 — 화면 근처 카드만 요약 텍스트 노드를 갖는다. 그래서 이 캡처를
  비전으로 읽는 경로를 쓴다.
- 같은 날 자동 수집한 다른 목록이 `captures/`에 있다(배짱할인 브랜드특가
  15건 등). 대조에 참고할 수 있다.
