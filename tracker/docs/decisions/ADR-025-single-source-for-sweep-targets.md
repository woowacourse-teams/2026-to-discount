# ADR-025. 순회 대상은 사본이 아니라 brands.yml에서 읽는다

- 날짜: 2026-09-07
- 상태: 확정
- 관련: [ADR-018](ADR-018-original-repo-is-the-working-copy.md), `scripts/sweep_baemin_links.py`,
  `data/_retired/baemin_brand_links.json`, 커밋 f7b7d99

## 맥락

배민 브랜드 딥링크 순회는 대상 목록을 `data/baemin_brand_links.json`에서
읽었다. 그 파일은 `brands.yml`의 `links.baemin`을 복사해 둔 사본이다.

2026-09-07에 클립보드로 딥링크 92건을 받아 `brands.yml`의 배민 링크가
76 → 110곳으로 늘었다. 그리고 순회를 돌렸다.

**사본은 68곳 그대로였다.** 그날 새로 모은 링크는 한 곳도 대상에 없었고,
사본이 들고 있던 bhc 링크(`7o3.f7e8q`)는 이미 죽은 옛 단축주소였다.

돌려 보기 직전에 사본을 열어 봐서 알았다. 안 열어 봤으면 "110곳 중 68곳만
돌았다"는 사실을 아무도 모른 채 결과가 원장에 들어갔을 것이다. 순회는
정상 종료하고, 성공 68 / 실패 0을 찍는다. **틀린 값이 아니라 없는 값이
생기는 실패**라 화면에도 로그에도 티가 안 난다.

## 판단

**순회 대상은 `brands.yml`에서 직접 읽는다. 사본을 만들지 않는다.**

```python
from capture.brand_links import load_brand_links
from scripts._env_paths import brands_yml

links = load_brand_links(brands_yml(), "baemin")
```

기존 사본은 지우지 않고 `data/_retired/`로 옮겼다(그 디렉터리 README에
경위를 적었다). 지운 파일은 못 되살리지만 안 읽는 파일은 해가 없다.

## 왜 사본을 두면 안 되나

- **`brands.yml` 머리에 "브랜드 지식의 단일 출처"라고 적혀 있다.** 사본을
  두는 순간 그 문장이 거짓이 되고, 문서를 믿은 사람이 틀린다.
- **사본이 낡는 것은 조용하다.** 링크가 죽으면 열었을 때 실패라도 하지만,
  대상에서 빠진 브랜드는 아무 신호도 안 낸다. 실패 0이 안심을 준다.
- **갱신 경로가 둘이면 하나는 반드시 잊힌다.** `catch_link.py`는
  `brands.yml`만 고친다. 사본을 같이 고치게 만들 수도 있었지만, 그러면
  "둘을 맞추는 일"이 새 일감이 되고 그것도 잊힌다.

## 같은 모양의 사본이 또 있다

`mono/tracker/data/`의 `export.json`, `log.jsonl`은 배포가 보는 사본이라
성격이 다르다. 이쪽은 **의도한 미러**고 ADR-018이 다룬다. 다만 동기화를
빠뜨리면 같은 방식으로 조용히 끊기므로, 수집 뒤에는 항상 함께 민다.

## 뒤따르는 점검

`scripts/bootstrap_check.py`나 순회 시작 로그가 **대상 수를 찍는다.**
"대상 110"이 평소보다 갑자기 줄면 그 자리에서 눈에 띈다. 이번에도
"대상 110 / 남음 110"이 첫 줄에 찍혀 확인이 됐다.
