# API 성능 지표 제공

## 필요 배경

기존 서버 상태 수집은 5분 간격의 메모리, 디스크, 요청 건수 중심이다.
부하가 증가할 때 응답 시간 분포와 JVM, 요청 처리 스레드를 함께 확인할 지표가 없다.
개발 서버에서 부하 테스트를 진행하고 운영에서도 같은 지표로 병목을 분석한다.
테스트 실행 자체와 부하 시나리오, 합격 기준은 이 변경의 범위 밖이다.

## 확정한 최소 지표

| 대상 | 지표 | 확인할 내용 | 수집 경로 |
| --- | --- | --- | --- |
| API 요청 | 엔드포인트, 메서드, 응답 코드별 완료 요청 수 | 초당 처리량, 4xx/5xx 비율 | Actuator |
| API 응답 시간 | 요청 시간 count, sum, 히스토그램 | 평균, p95, p99 | Actuator |
| API 프로세스 | CPU 사용률 | API 연산 병목 | Actuator |
| JVM 메모리 | heap/non-heap 사용량, committed, max | 메모리 압박과 증가 추이 | Actuator |
| JVM GC | GC 정지 횟수와 누적 시간 | GC 빈도와 정지 부담 | Actuator |
| 요청 처리 | Tomcat 사용 중/현재/최대 스레드, JVM live 스레드 | 작업 스레드 포화 | Actuator |
| 서버 자원 | CPU, 가용 메모리, 디스크 가용량과 I/O, 네트워크 전송량 | 서버 자원 병목 | 후속 Alloy unix exporter 설정 |

DB를 사용하지 않으므로 DB 연결 풀 지표는 추가하지 않는다.
부하 생성기의 실제 전송량, 실패와 타임아웃, 클라이언트 관점의 응답 시간은
테스트 도구가 기록해야 한다. 서버에 도달하지 못한 요청은 API 지표에 나타나지 않는다.
API 처리 시간에는 Nginx 및 클라이언트 네트워크 대기 시간이 포함되지 않는다.
GC 정지 지표는 해당 GC 이벤트가 발생한 뒤 노출된다.

## 구현

Spring Boot Actuator와 Micrometer Prometheus registry를 사용한다.
운영과 개발 모두 같은 application.yml을 사용한다.

- 조회: `http://127.0.0.1:9090/actuator/prometheus`
- 관리 포트: `DISCOUNT_METRICS_PORT`, 기본 9090
- 관리 주소: 127.0.0.1 고정
- 공개 API 포트에 Actuator 엔드포인트를 제공하지 않는다.
- Prometheus 외의 Actuator 엔드포인트를 비활성화한다.
- Tomcat MBean 등록을 활성화해 작업 스레드 지표를 제공한다.
- 관리 포트는 API 포트와 달라야 한다. Nginx에 관리 포트의 프록시를 추가하지 않는다.
- 인증 토큰은 API 지표 조회에 필요하지 않다. Grafana Cloud 전송 토큰은 후속 Alloy 단계에서 준비한다.

HTTP 라벨은 Micrometer 기본 convention을 사용한다.
매핑된 경로는 `/api/.../{id}` 형태의 템플릿으로 기록한다.
쿼리 문자열, 요청 ID, 사용자 ID, IP를 커스텀 라벨에 넣지 않는다.
서버 환경 라벨 `environment=production|development`는 후속 Alloy 설정에서 붙인다.
관리 엔드포인트의 요청도 기록될 수 있으므로 대시보드 API 쿼리는 `uri=~"/api/.*"`로 제한한다.

### 응답 시간 히스토그램

고정 버킷 상한은 5, 10, 25, 50, 100, 250, 500ms 및 1, 2, 5, 10, 30초다.
무한대 버킷도 포함된다. 자동 생성 percentile 버킷과 클라이언트 계산 percentile은 추가하지 않는다.
명시한 버킷은 운영 SLO나 부하 테스트 합격 기준을 의미하지 않는다.

p95와 p99는 버킷 안에서 보간한 추정값이다.
샘플이 적거나 응답이 버킷 사이에 몰리면 오차가 커진다.
30초를 넘는 응답은 무한대 버킷에 모이므로 해당 구간의 percentile을 정확히 판정할 수 없다.
정확한 개별 요청 시간은 부하 테스트 도구의 결과와 함께 확인한다.
필요한 판정 기준이 정해지면 그 주변의 버킷을 조정한다.

## 조회 예시

후속 Alloy 구성에서 environment 라벨을 붙인 뒤 Grafana에서 사용한다.

```promql
# 엔드포인트별 초당 처리량
sum by (uri) (rate(http_server_requests_seconds_count{environment="development",uri=~"/api/.*"}[1m]))

# 엔드포인트별 p95, 초 단위
histogram_quantile(0.95,
  sum by (le, uri) (rate(http_server_requests_seconds_bucket{environment="development",uri=~"/api/.*"}[1m]))
)
```

## 검증과 후속 작업

통합 테스트는 실제 API와 별도의 관리 HTTP 포트를 띄운다.
정상 요청, 500 응답, 히스토그램, JVM과 Tomcat 지표를 확인한다.
API 포트의 Actuator 접근 차단과 관리 포트의 비공개 엔드포인트 차단을 확인한다.
동적 경로와 쿼리의 식별자가 지표에 노출되지 않는지 검사한다.

이번 단계는 API 코드와 PR까지다. 병합과 배포는 별도이며 서버 설정을 변경하지 않는다.
다음 단계는 두 서버에서 관리 포트 충돌 확인, Alloy 수집 및 Grafana Cloud 전송,
서버 자원 exporter 설정, 환경별 대시보드 구성이다.
활성 시계열은 실제 수집 이후 확인한다. 무료 한도 10,000 활성 시계열과
14일 보관 안에서 사용할 수 있도록 전송할 metric family를 제한한다.
