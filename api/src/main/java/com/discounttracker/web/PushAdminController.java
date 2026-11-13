package com.discounttracker.web;

import com.discounttracker.push.NewOfferNotificationService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

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
        OpsAuth.require(request);
    }

    public record Selection(String mode, String offerId) {}
}
