package com.discounttracker.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * 운영 콘솔(beggars-ops) 경유 요청만 통과시키는 관리자 인증(설계 46, 317).
 *
 * <p>외부 요청의 표시 헤더는 Nginx가 지운다. 인증한 관리 경로에서만 다시 붙인다.
 * API는 루프백에서 온 {@code X-Ops-Authenticated: 1}만 믿는다. 관리 엔드포인트가
 * 늘어도 이 검사는 한 곳이다.
 */
public final class OpsAuth {

    private OpsAuth() {}

    /** 통과하지 못하면 403. */
    public static void require(HttpServletRequest request) {
        String peer = request.getRemoteAddr();
        boolean internal = "127.0.0.1".equals(peer) || "::1".equals(peer) || "0:0:0:0:0:0:0:1".equals(peer);
        if (!internal || !"1".equals(request.getHeader("X-Ops-Authenticated")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "운영 콘솔 인증 경로로 접근해야 합니다.");
    }

    /** Nginx가 붙이는 Basic Auth 사용자 이름. 없으면 400 — 누가 바꿨는지 모르는 변경은 받지 않는다. */
    public static String user(HttpServletRequest request) {
        String user = request.getHeader("X-Ops-User");
        if (user == null || user.isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "X-Ops-User 헤더가 없습니다.");
        return user.trim();
    }
}
