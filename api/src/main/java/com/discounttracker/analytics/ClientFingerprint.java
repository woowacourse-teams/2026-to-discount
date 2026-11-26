package com.discounttracker.analytics;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.HexFormat;

/**
 * 요청자를 원본 IP 없이 구분한다.
 *
 * <p>봇·중복 요청을 걸러내려면 "같은 사람인가"는 알아야 하는데, 원본 IP를
 * 그대로 저장하면 그 자체가 개인정보다. 그래서 <b>프로세스마다 새로 만드는
 * 난수 솔트 + 날짜</b>로 해시한다. 결과적으로
 *
 * <ul>
 *   <li>같은 날, 같은 IP → 같은 해시 (그날의 중복·과다 요청 판별 가능)</li>
 *   <li>날짜가 바뀌면 → 다른 해시 (사람을 날짜 넘어 추적 불가)</li>
 *   <li>서버를 재시작하면 → 솔트가 바뀌어 과거와 연결 불가</li>
 * </ul>
 *
 * 역산도 불가능하다 — 솔트가 디스크에 없다.
 */
@Component
public class ClientFingerprint {

    private final byte[] salt = new byte[32];

    public ClientFingerprint() {
        new SecureRandom().nextBytes(salt);
    }

    public String hash(HttpServletRequest request) {
        return hash(clientIp(request), LocalDate.now().toString());
    }

    /** 요청 제한용. {@link #hash(HttpServletRequest)}와 같은 IP 규칙이다(예전에는 둘이 달라 원장 쪽이 위조됐다). */
    public String hashForLimit(HttpServletRequest request) {
        return hash(request);
    }

    String hash(String ip, String day) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(salt);
            md.update(day.getBytes(StandardCharsets.UTF_8));
            md.update(ip.getBytes(StandardCharsets.UTF_8));
            // 앞 8바이트면 충돌 없이 구분되고, 원본 복원 여지는 더 줄어든다.
            return HexFormat.of().formatHex(md.digest(), 0, 8);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 없음", e);
        }
    }

    /**
     * 클라이언트 IP. 바로 앞 연결이 같은 기계나 내부망의 프록시(nginx)일 때만 헤더를 믿는다.
     * X-Forwarded-For 첫 항목은 클라이언트가 지어 보낼 수 있으니 쓰지 않는다. nginx가 넣는 X-Real-IP,
     * 없으면 nginx가 덧붙인 X-Forwarded-For 마지막 항목이다. 프록시를 거치지 않은 연결은 헤더를 무시한다.
     */
    static String clientIp(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        if (remote == null || remote.isBlank()) return "unknown";
        if (!trustedProxy(remote)) return remote;
        String ip = request.getHeader("X-Real-IP");
        if (ip == null || ip.isBlank()) {
            String forwarded = request.getHeader("X-Forwarded-For");
            if (forwarded != null && !forwarded.isBlank()) {
                String[] parts = forwarded.split(",");
                ip = parts[parts.length - 1];
            }
        }
        return ip == null || ip.isBlank() ? remote : ip.trim();
    }

    private static boolean trustedProxy(String remote) {
        try {
            // getRemoteAddr는 숫자 주소라 DNS 조회가 일어나지 않는다.
            InetAddress a = InetAddress.getByName(remote);
            return a.isLoopbackAddress() || a.isSiteLocalAddress();
        } catch (UnknownHostException e) {
            return false;
        }
    }
}
