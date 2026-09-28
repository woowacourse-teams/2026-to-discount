<!-- 원본: tracker docs/public/README.md — 여기서 고치지 않는다 -->
# docs/public — mono로 나가는 문서

여기 있는 문서만 공개 저장소 mono의 `docs/` 같은 자리로 나간다. 나머지 tracker 문서는 안 나간다.

    python scripts/publish_docs.py --apply    # 민감 정보를 검사하고 mono/docs에 쓴다

- 전파되는 문서는 첫 줄에 `<!-- 원본: tracker docs/public/<경로> — 여기서 고치지 않는다 -->`를 단다. mono에서 고치면 다음 전파에 덮인다
- 서버 안쪽 경로, 계정·키 파일 이름, 토큰, 러너 이름이 들어 있으면 내보내지 않는다(`scripts/publish_docs.py`의 `SENSITIVE`)
- 이 문서 자신도 mono `docs/README.md`로 나간다. mono 쪽 독자에게 "이 자리의 문서는 tracker에서 온다"를 알리는 역할이다
