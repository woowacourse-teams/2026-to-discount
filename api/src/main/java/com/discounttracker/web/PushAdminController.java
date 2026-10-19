package com.discounttracker.web;

import com.discounttracker.push.NewOfferNotificationService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/push/admin/next")
public class PushAdminController {
    private final NewOfferNotificationService notifications;

    public PushAdminController(NewOfferNotificationService notifications) {
        this.notifications = notifications;
    }

    @GetMapping
    public NewOfferNotificationService.ManagementView next(
            HttpServletRequest request,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        authorize(request);
        return notifications.next(date);
    }

    @PutMapping
    public NewOfferNotificationService.ManagementView update(
            HttpServletRequest request,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date, @RequestBody Selection selection) {
        authorize(request);
        return notifications.update(date, selection.mode(), selection.offerId());
    }

    private void authorize(HttpServletRequest request) {
        // 외부 요청의 표시 헤더는 Nginx가 지운다. 인증한 관리 경로에서만 다시 붙인다.
        String peer = request.getRemoteAddr();
        boolean internal = "127.0.0.1".equals(peer) || "::1".equals(peer) || "0:0:0:0:0:0:0:1".equals(peer);
        if (!internal || !"1".equals(request.getHeader("X-Ops-Authenticated")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "운영 콘솔 인증 경로로 접근해야 합니다.");
    }

    public record Selection(String mode, String offerId) {}
}
