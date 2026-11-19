<!-- 원본: tracker docs/specs/issue-22-export-console-utf8.md — 여기서 고치지 않는다 -->
# 이슈 #22: 내보내기 콘솔 출력의 한글 깨짐 (설계)

영역: `export` (폰 불필요). 코드는 이 문서를 승인한 뒤 구현자가 고친다.

## 1. 요약

`export_data.py`만 `main()`에서 표준 출력 인코딩을 고정하지 않는다. 같은 저장소의 다른 CLI 진입점 40여 곳은 `config.use_utf8_stdout()`을 한 번 부른다. 새 처리를 만들지 않고 그 공통 함수를 `export_data.main()` 첫 줄에서 부른다. 출력 내용은 바꾸지 않는다.

이슈 할 일에 적힌 `sys.stdout.reconfigure(encoding="utf-8")`를 직접 쓰지 않는다. 이유:

- 이슈가 "다른 스크립트 공통 처리가 이미 있으면 그것을 따름"이라고 했고, 그것이 `config.use_utf8_stdout()`이다(`config.py:29`).
- 공통 함수는 `errors="replace"`와 stderr까지 처리한다. 직접 쓰면 줄표(—) 같은 문자 하나로 `UnicodeEncodeError`가 나서 내보내기가 죽는 옛 사고(`config.py` 독스트링)를 다시 열 수 있다. 내보내기 `main()`의 출력에는 `·`, `->`, 한글이 섞여 있다(`export_data.py:843`).

## 2. 폭발 반경

`mono/docs/CHANGE-PROPAGATION.md`에서 `export_data.py`나 인코딩 처리를 가리키는 묶음을 찾았으나 없다(검색어 `export_data`, `내보내기`, `export`가 맞는 두 줄은 배너 최소 주문 금액 읽기이고 이번 변경과 무관). 없다고 말하고 시작한다.

같은 종류로 점검한 자리:

- 호출처 셋. (a) 손 실행 `python export_data.py`. (b) `scripts/reflect_daily.py:483`이 `subprocess.run([PYTHON, "export_data.py"], cwd=ROOT, check=True)`로 띄움(출력을 따로 받지 않아 부모의 표준 출력을 물려받음). (c) `scripts/deploy_export.py:244`가 `export_data.main()`을 같은 프로세스에서 부름(부모가 이미 `deploy_export.py:217`에서 UTF-8로 고정해 두 번째 호출은 같은 설정을 다시 거는 것이라 무해). `scripts/collect_all.py:108`도 `run("export_data.py")`로 띄운다. (b)와 `collect_all.py` 경로는 자식이 UTF-8로 쓰므로, 받는 쪽(예약 로그 파일 등)이 UTF-8이어야 한다(아래 §6 미확인 1).
- 파일 쓰기. `export.json`, `brands-sorted.txt`, `first_seen`은 이미 `encoding="utf-8", newline="\n"`이다. 콘솔 출력만 대상이고 산출물은 바뀌지 않는다.
- 원장(`data/log.jsonl`). 읽기만 한다. append-only 위반 없음.
- 같은 결함이 남은 다른 진입점. 위 호출 목록에 없고 `reconfigure`도 없는 `scripts/*.py` CLI가 더 있는지는 이번 범위에 넣지 않는다. 이슈는 `export_data.py` 하나이고, 전수 점검은 한 PR 리뷰 범위를 넘긴다. 구현자가 발견한 목록을 PR 후속 조치에 적는다.

## 3. 변경

- `export_data.py`: `from config import use_utf8_stdout` 추가. 이 파일은 `from store import ...` 아래에 평면 import를 쓰므로 같은 자리에 둔다. `main()` 첫 줄(`records = read_records(...)` 앞)에서 `use_utf8_stdout()` 호출.
- 첫 줄이어야 하는 이유: 공유 링크 줄(`export_data.py:810`)이 `read_records` 다음 `try` 안에서 가장 먼저 한글을 찍는다. `read_records`나 네트워크 확인이 예외를 던져도 그 앞에서 고정돼 있어야 오류 메시지의 한글도 읽힌다.
- 모듈 import 시점에는 부르지 않는다. 테스트와 다른 스크립트가 `export_data`를 import할 때 pytest의 출력 캡처를 건드리지 않기 위함이다(다른 진입점도 모두 `main()` 안에서 부른다).

## 4. "없다 / 0 / 통과"의 양성 신호

이 변경은 값을 내는 판정이 아니라 출력 통로다. 다만 아래 둘은 조용히 틀릴 수 있다.

- 인코딩 고정이 "됐다"는 신호. `hasattr(stream, "reconfigure")`가 거짓인 스트림(파이프가 아닌 래퍼, 일부 캡처 객체)은 `use_utf8_stdout`이 조용히 건너뛴다. 그래서 테스트는 호출 여부만이 아니라 실제 바이트를 읽어 본다(§5 테스트 2).
- 줄 내용이 그대로라는 신호. 출력 문자열을 건드리지 않았음을 `쿠팡이츠 링크:` 줄과 `export.json` 줄의 접두 문구가 인코딩 뒤에도 같은 한글로 디코드되는지로 확인한다.

## 5. 테스트 (결론은 테스트로 박는다)

새 파일 `tests/test_export_data_stdout.py`, 테스트 둘. 이슈의 "작은 테스트 하나"는 호출 연결과 실제 인코딩 두 가지로 나뉘어서 둘로 한다.

1. `test_main_fixes_stdout_encoding_first`: `export_data.use_utf8_stdout`을 호출 기록 함수로 바꾸고 `export_data.read_records`가 센티널 예외를 던지게 한다. `main()`을 부르면 센티널이 올라오고, 기록에는 호출이 한 번 있어야 한다. `read_records`보다 앞서 호출된다는 순서를 박는다. 네트워크, 파일을 건드리지 않는다.
2. `test_use_utf8_stdout_writes_utf8_bytes_on_cp949_stream`: `io.TextIOWrapper(io.BytesIO(), encoding="cp949")`를 `sys.stdout`으로 monkeypatch한 뒤 `config.use_utf8_stdout()`을 부르고 `쿠팡이츠 링크: 사람 0 · 공유 35`를 찍는다. `flush` 후 바이트를 `.decode("utf-8")` 했을 때 원문과 같아야 한다. cp949로 인코딩 불가한 문자(`—`)가 섞여도 예외 없이 지나가야 한다. 이 테스트가 공통 함수의 약속을 박는다. 같은 약속을 다루는 기존 테스트는 없다(`reconfigure`는 `test_local_banner_source.py`가 무력화할 때만 나온다).

두 테스트 모두 폰, 네트워크, `data/` 쓰기가 필요 없다. 시험 명령: `python -m pytest tests/test_export_data_stdout.py tests/test_export_data.py -q`. 나머지 점검 명령은 `docs/HARNESS.md` §11.

## 6. 미확인과 위험

- **미확인 1: 예약 로그 경로.** `reflect_daily.py`와 `collect_all.py`가 자식 `export_data.py`의 출력을 어디로 보내는지(로그 파일, 파이프 디코드)는 읽지 않았다. 받는 쪽이 cp949로 읽으면 UTF-8 고정이 로그를 새로 깨뜨릴 수 있다. 두 부모 모두 자기 출력을 UTF-8로 고정하므로(`reflect_daily.py:421`, `collect_all.py:42`) 문제없을 것으로 보지만 구현자가 `run_routine.py`의 로그 읽기와 함께 확인한다.
- **미확인 2: 이슈의 증상 재현.** 이슈의 `��`는 "쓰는 쪽 인코딩과 읽는 쪽 인코딩이 다름"의 증상이다. 윈도 콘솔에 직접 찍으면 파이썬이 콘솔 API로 쓰므로 보통 깨지지 않는다. 증상은 터미널 호스트가 파이프나 리다이렉트를 거칠 때 나온 것으로 추정한다. 실제 윈도에서 `python export_data.py`를 돌려 보는 것은 구현 PR이 아니라 병합 뒤 사람이 확인한다(§7). 이 클라우드 러너는 윈도가 아니라 재현하지 않는다.
- UTF-8로 고정하면 cp949로 디코드하는 뷰어에서 보면 반대로 깨진다. 저장소 전체가 UTF-8로 통일돼 있어(다른 40여 진입점) 일관성을 우선한다.

## 7. 끝 조건

- `python -m pytest tests/test_export_data_stdout.py tests/test_export_data.py -q` 통과.
- `export_data.py` 외 코드 변경 없음(미확인 1에서 다른 파일 수정이 필요하다고 판명되면 그 사실을 PR 본문 설계 변동에 적는다).
- 병합 뒤 사람이 윈도 콘솔에서 `python export_data.py` 출력의 한글을 눈으로 확인한다. 이 항목은 PR 본문 `미확인`으로 남긴다.
