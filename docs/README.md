<!-- 원본: tracker docs/public/README.md — 여기서 고치지 않는다 -->
# docs/public — mono로 나가는 문서

tracker(비공개)의 문서는 두 갈래로 공개 저장소 mono에 나간다.

    python scripts/publish_docs.py --apply    # 민감 정보를 가리고 검사한 뒤 mono/docs에 쓴다

| tracker 자리 | mono 자리 | 어떻게 |
|---|---|---|
| `docs/public/` | `docs/` | 그대로. 팀 입구 `WORKFLOW.md`, 구조와 이유 `ARCHITECTURE.md`, `CROSS-REPO-TESTS.md`, `decisions/ADR-002`, 회고 `incidents/`, `team/` |
| 그 밖의 `docs/` 전부 | `docs/collector/` | 설계, 결정(ADR), 실험, 조사, 설치, 작업 방식, 하네스. 서버 경로, 키 파일 이름, 내부 IP, 폰 일련번호, 토큰, 러너 이름은 `<...>` 자리표시로 가린다(2026-11-20 사용자) |

- 전파되는 문서는 첫 줄에 `<!-- 원본: tracker docs/<경로> — 여기서 고치지 않는다 -->`가 붙는다. mono에서 고치면 다음 전파에 덮인다. 목록은 `docs/collector/README.md`(자동 생성)
- 가린 뒤에도 `SENSITIVE`에 걸리면 그 파일은 내보내지 않고 실패한다. 새 폰, 새 키 파일, 새 서버 경로가 생기면 `scripts/publish_docs.py`의 `SERIALS`, `REDACT`, `SENSITIVE`에 같이 더한다
- 수집기 코드, 원장, 캡처는 나가지 않는다(ADR-002). 문서 속 tracker 상대 링크는 비공개 저장소를 가리켜 열리지 않을 수 있다
- 이 문서 자신도 mono `docs/README.md`로 나간다
