<!-- 원본: tracker docs/public/incidents/2026-09-22-decision-table.md — 여기서 고치지 않는다 -->
# 할인 비교 규칙을 판정표 하나로: 8행에서 30행, 40행으로 (2026-09-22 ~ 10-11)

**요약:** "최고 할인 후보인가, 정렬에 얼마로 기여하나" 규칙이 서버(Java)와 웹(JavaScript)에 두 벌 있었고, 이미 서로 다른 답을 내고 있었다. 규칙은 식 한 줄과 `switch`로, 기대값은 판정표(입력 조합마다 기대 결과를 적은 JSON 한 파일)로 두고 두 언어의 테스트가 같은 표를 읽게 했다. 표는 처음 계획의 8행에서 빠짐없는 30행, 1+1 행사를 받으며 40행이 됐다.

## 문제

- 정렬에서 뺀 할인이 다시 올라오는 일이 잦았다.
- 웹은 특정 메뉴 한정 쿠폰을 정렬에서 뺐고, 서버는 4,999원으로 눌러 정렬에 남겼다. 같은 할인에 두 답이 나왔다.
- 같은 종류의 선례가 있었다. 2026-08-06 중복 정리 규칙이 수집기 쪽은 상세 칸 3개, 서버 쪽은 5개를 병합하고 있었다.

## 설계

- 질문을 둘로 나눴다. 특정 메뉴 쿠폰은 최고 할인 후보에서는 빠지지만 정렬에는 남아야 해서, 한 규칙으로 합치면 답이 틀린다.
- 축은 확실성(정확, 최대, 랜덤, 특정 메뉴, % 할인) 5 × 종류(할인, 캐시백, 적립) 3 × 품절 여부 2 = 30칸이다.

```java
public static boolean isBestCandidate(Certainty certainty, AmountKind kind, boolean soldOut) {
    return certainty == Certainty.EXACT && kind == AmountKind.DISCOUNT && !soldOut;
}
public static Integer sortingAmount(Certainty certainty, Integer amount) {
    return switch (certainty) {
        case MENU_ONLY -> MENU_LIMITED_SORTING_AMOUNT;   // 4999
        case CAPPED, RANDOM, PERCENT -> null;
        case EXACT -> amount;
    };
}
```

표: [`certainty-cases.json`](../../api/src/test/resources/contracts/certainty-cases.json). 설계 문서: [`2026-09-22-banner-model-design.md`](../archive/superpowers/specs/2026-09-22-banner-model-design.md).

## 8행에서 30행으로 (09-22)

- 계획은 표를 8행만 지시했다. 검토가 "30가지 중 8가지만 덮었다"고 짚었다.
- 30행을 채운 뒤에도 테스트는 `cases.size() >= 8`로 행 수만 세서, 22행을 지워도 통과했다.
- 열거형 값의 모든 조합을 만들어 표와 견주는 교차곱 테스트로 바꿨다. 빠진 조합과 남는 조합을 둘 다 잡는다. 행 수만 비교하면 중복 한 줄과 누락 한 줄이 서로 상쇄된다.

```java
for (Certainty certainty : Certainty.values())
    for (AmountKind kind : AmountKind.values())
        for (boolean soldOut : new boolean[] {false, true})
            expected.add(comboKey(certainty.key(), kind.key(), soldOut));
assertEquals(Set.of(), missing, "판정표에 없는 조합: " + missing);
assertEquals(Set.of(), extra, "판정표에 있으면 안 되거나 중복 흡수로 구멍을 가리는 조합: " + extra);
```

## 30행에서 40행으로 (10-11)

- 1+1 묶음 행사를 받으며 종류에 `BUNDLE`이 늘었다. 교차곱 테스트가 새 값의 10행을 표에 요구했고, 같은 커밋이 10행을 더했다.
- 정형 구조에 안 맞는 정렬값은 표 밖 예외 한 줄로 두었다. 1+1, 2+1, 랜덤처럼 행사 유형이 계속 새로 나와서, 모든 유형을 한 구조에 넣으면 새 유형마다 구조를 갈아야 한다.

## 표를 지키는 장치도 고쳤다

- JSON만 고치면 빌드 도구가 테스트를 건너뛰었다. 입력 파일로 선언해 고쳤다.
- 그 선언이 배포 미러에서 테스트 전체를 죽일 수 있었다. 경로를 고쳤다.
- 모르는 확실성 값이 기본값 `EXACT`로 떨어져 최고 후보로 섰다(09-29에 `CAPPED`로 바꿈).
- 판정표는 09-29에 서버 저장소 한 곳(`api/src/test/resources/contracts/`)으로 옮겨 서버, 웹, 운영 콘솔, 수집기 테스트가 같이 읽는다. [CROSS-REPO-TESTS.md](../CROSS-REPO-TESTS.md)

## 한계

- 웹 테스트는 아직 표의 행 수만 센다. 빠짐없는지는 서버 쪽만 지킨다.
- 표는 사례만 본다. 사례 밖 모양의 운영 데이터는 초록인 채 통과할 수 있다.

## 배운 것

- 같은 질문에는 한 곳의 규칙이 답하게 한다. 언어가 달라 함수 하나로 못 모으면 기대값을 한 파일로 모은다.
- "몇 행 이상" 같은 검사는 지키는 것이 없다. 빠짐없음은 조합으로 검사한다.
