package com.discounttracker.analytics;

import java.util.Map;

/**
 * 방문 이벤트 한 건. 클라이언트가 보낸 값에 서버가 시각과 IP 해시만 얹는다.
 *
 * <p>개인을 식별할 수 있는 값은 담지 않는다 — 원본 IP도, UA 문자열도 저장하지
 * 않는다. {@code visitorId}는 브라우저가 만든 난수라 사용자가 지우면 끊긴다.
 *
 * @param visitorId  재방문 판별용 난수(localStorage). 개인 식별자가 아니다.
 * @param sessionId  한 번의 방문(sessionStorage). 경로 추적용.
 * @param visitCount 이 브라우저의 누적 방문 회차.
 * @param referrer   유입 구분만 — {@code direct|internal|external}. 원본 URL은 안 받는다.
 * @param device     {@code mobile|desktop}. UA 문자열 대신 이것만 받는다.
 * @param dwellMs    체류 시간(ms). page_exit 계열에만 들어온다.
 * @param ipHash     원본 IP가 아니라 날짜별 솔트로 해시한 값(하루 지나면 연결 불가).
 * @param dev        개발자 본인의 테스트 트래픽 표시({@code ?dev=1}로 켬). 집계 시
 *                   {@code jq 'select(.dev != true)'}로 제외한다.
 */
public record VisitEvent(
        String ts,
        String event,
        String visitorId,
        String sessionId,
        Integer visitCount,
        String path,
        String referrer,
        String device,
        String viewport,
        Long dwellMs,
        Map<String, String> props,
        String clientTs,
        String ipHash,
        Boolean dev
) {
}
