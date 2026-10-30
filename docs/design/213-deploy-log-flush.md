# 213 운영 배포 스크립트 로그를 줄마다 바로 내보낸다

이슈: [#213](https://github.com/woowacourse-teams/2026-to-discount/issues/213). `api/deploy/prod/stage_deploy.py`만 바꾼다. 로그 문구와 종료 코드는 그대로다.

## 문제

2026-10-29 자동 복구 시험(미러 실행 40842228384)에서 배포 단계가 61초 돌았는데 스크립트 로그 줄이 전부 같은 순간(`08:29:18.29…Z`)으로 찍혔다. 이 시각은 이슈 본문이 실행 로그에서 확인한 값이다.

원인은 추정이다. 코드에서 확인한 근거는 둘이다.

- `deploy()`의 기본 로그 함수가 `log=print`다(`stage_deploy.py:146`). 표준 출력이 파이프일 때 파이썬은 블록 버퍼링이라, 줄이 버퍼에 모였다가 종료 때 한꺼번에 나간다.
- `main()`은 표준 출력 설정을 안 건드린다(`stage_deploy.py:227~245`). 이 저장소에는 미러 `deploy.yml`이 없어 `python3 deploy/prod/stage_deploy.py` 호출에 `-u`나 `PYTHONUNBUFFERED`가 있는지는 여기서 볼 수 없다. 이슈 본문이 없다고 적었다.

설계 [188](188-zero-downtime-deploy.md)의 "빠진 증거"는 줄별 시각이 없다고 적고 "스크립트가 줄마다 시각을 찍어야 한다"로 처방했다. Actions가 줄을 받은 시각을 줄마다 붙이므로 스크립트가 시각을 찍을 필요는 없다. 줄을 바로 내보내면 된다. 이 설계는 그 처방을 대체한다.

## 결정

기본 로그 함수를 줄마다 flush하는 함수로 바꾼다. 표준 출력 전체를 줄 단위 버퍼로 바꾸는 쪽(`sys.stdout.reconfigure(line_buffering=True)`)은 택하지 않는다.

- 이유: 로그 경로가 한 함수로 모이고, 시험이 그 함수를 직접 가리킬 수 있다. `reconfigure`는 `main()` 안에서만 효과가 있어 `deploy()`를 직접 부르는 시험이 못 본다. 시험 가능성이 이슈의 완료 조건이다.
- 미러 `deploy.yml`에 `PYTHONUNBUFFERED=1`을 넣는 길도 이 저장소 밖이라 택하지 않는다. 스크립트가 호출 환경에 기대지 않아야 호출부가 바뀌어도 줄이 바로 나간다.

## 바꾸는 곳

`api/deploy/prod/stage_deploy.py`.

- 모듈 함수 `emit(message)`를 더한다. 본문은 `print(message, flush=True)`다. `Ops` 클래스 앞, 종료 코드 아래에 둔다.
- `deploy()`의 `log=print`를 `log=emit`으로 바꾼다. `wait_out_push_window`, `stop_stage`, `prune`, `_rollback`은 `log`를 인자로 받으므로 바꿀 것이 없다.
- `main()`의 `print("다른 배포가 돌고 있다", file=sys.stderr)`는 그대로 둔다. 표준 오류는 파이썬 3.9부터 파이프여도 줄 단위로 나간다. 그래도 같은 파일에서 출력 경로가 둘로 갈리는 것이 걸리면 구현자가 `emit`에 `file` 인자를 주는 것은 허용하되, 문구와 종료 코드는 바꾸지 않는다.

바꾸지 않는 것: 로그 문구, 종료 코드(`OK`, `STAGE_FAILED`, `ROLLED_BACK`, `NEEDS_HUMAN`), `Ops`, 순서, 시간 값.

`systemctl`의 출력은 `subprocess.run`이 자식에게 같은 파일 기술자를 물려주는 직출력이다. 지금은 파이썬 버퍼에 남은 앞선 로그보다 먼저 나갈 수 있었다. flush가 되면 줄 순서도 실행 순서와 맞는다. 이 변화는 의도한 것이다.

## 전파 확인 (`docs/CHANGE-PROPAGATION.md`)

- 1~7번 묶음: 해당 없음. 배너, 알림, 문구, 이벤트를 안 건드린다.
- 8번 배포: `api/deploy/prod/`는 미러로 가고 미러 `deploy.yml`이 부른다. 이번에 미러 쪽은 바꾸지 않는다. 호출 인자와 종료 코드가 그대로라 순서 제약이 없다. 이 변경은 다음 운영 배포부터 효과가 난다.
- 9번 새 파일: 없다. `test_stage_deploy.py`는 `check-api.yml`의 `unittest discover -s deploy/prod -p 'test_*.py'`가 이미 돌린다. 시험을 같은 파일에 더하므로 새로 등록할 것이 없다.
- `api/deploy/dev/deploy.py`도 `print`를 쓴다(`deploy.py:107`, `117`). 개발 배포는 이번 이슈 범위 밖이다. 같은 증상이 있는지는 보지 않았으므로 고치지 않고, 필요하면 별도 이슈로 올린다.
- 설계 188의 `109`, `357`, `372`행은 당시 기록이다. 고치지 않는다. 이 문서가 처방을 대체했음은 위 "문제"에 적었다.

## 테스트

`api/deploy/prod/test_stage_deploy.py`에 더한다. 두 시험이다.

1. **기본 로그가 줄마다 flush한다.** `write`와 `flush` 호출 순서를 쌓는 가짜 스트림을 `contextlib.redirect_stdout`으로 표준 출력에 건다. `log`를 안 주고 `sd.deploy(...)`를 불러 정상 경로를 한 번 돌린다. 쌓인 호출에서, 내용이 있는 `write`마다 다음 `write` 전에 `flush`가 있음을 단언한다. 양성 신호로 `write`가 한 번도 안 불린 경우를 먼저 실패시킨다(줄이 하나도 안 나왔는데 "순서가 맞다"가 통과하지 않게). `FakeOps`는 `sleep`이 시계만 올리고 실제로 안 자므로 시험이 느려지지 않는다.
2. **파이프에서 첫 줄이 종료 전에 나온다.** 부모가 `subprocess.Popen`으로 파이썬 자식을 띄운다. 자식은 `emit("첫 줄")`을 부른 뒤 `sys.stdin.readline()`에서 막혀 기다린다. 부모는 자식 표준 출력에서 한 줄을 읽는다. 읽히면 통과, 그 뒤 자식 표준 입력을 닫아 끝낸다. 자식이 안 끝난 채 읽혀야 하므로 버퍼에 모였다면 부모의 읽기가 막힌다. 막혀 영원히 안 끝나지 않게 읽기에 제한 시간(예: `threading.Timer`로 자식을 죽임, 또는 `select`로 5초)을 둔다. 자식이 `stage_deploy`를 import 할 수 있게 `stage_deploy.py`가 있는 폴더를 `PYTHONPATH`로 넘긴다.

시험 2는 문제의 원인(파이프 버퍼링)을 직접 재현한다. 시험 1이 통과해도 실제 파이프에서 다르게 동작할 수 있으므로 둘 다 둔다.

되돌려 보는 확인(구현자): `emit`의 `flush=True`를 지우거나 `log=print`로 되돌리면 두 시험이 모두 실패하는 것을 한 번 본다. 실패를 못 보면 시험이 아무것도 못 막는 것이다.

실행: `cd api && python3 -m unittest discover -s deploy/prod -p 'test_*.py'` (`check-api.yml`과 같은 명령). 기존 시험 27개도 그대로 통과해야 한다.

## 확인 (병합 뒤, 사람이)

단위 시험은 파이프 동작까지만 증명한다. 완료 조건의 두 번째 항목은 운영에서만 확인된다.

- 수정이 미러로 간 뒤 첫 운영 배포의 실행 로그에서 "임시 인스턴스 준비됨(N초)"와 "본 인스턴스 준비됨(N초)" 줄의 시각이 서로 다른지 본다. 두 줄 사이에는 본 인스턴스 재시작이 있어 수 초가 벌어져야 한다.
- 결과를 이 이슈에 두 줄의 시각과 함께 남긴다. 시각이 여전히 같다면 원인 추정이 틀린 것이다. 그때는 미러 `deploy.yml`의 호출 방식(`-u`, 출력 리다이렉트, `tee`)을 본다.
- 확인 전에는 이슈를 닫지 않는다. 배포 시각은 병합 뒤에 안다.

## 리뷰 포인트

1. 미러 `deploy.yml`에 `PYTHONUNBUFFERED=1`도 넣어 이중으로 막을 것인가. 이 설계는 스크립트 쪽 한 곳으로 충분하다고 본다.
2. 개발 배포 `api/deploy/dev/deploy.py`의 `print`는 별도 이슈로 미룬다. 맞는가.
