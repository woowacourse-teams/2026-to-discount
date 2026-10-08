package com.discounttracker.web;

import com.discounttracker.push.NewOfferNotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.LocalDate;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PushAdminControllerTest {
    private final NewOfferNotificationService service = mock(NewOfferNotificationService.class);
    private MockMvc mvc() {
        return MockMvcBuilders.standaloneSetup(new PushAdminController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @Test
    void rejectsRequestsWithoutTrustedProxyMarker() throws Exception {
        var mvc = mvc();
        mvc.perform(get("/api/push/admin/next")).andExpect(status().isForbidden());
        mvc.perform(put("/api/push/admin/next").header("Authorization", "Bearer wrong")
                .contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"exclude\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void rejectsForgedMarkerFromExternalPeer() throws Exception {
        mvc().perform(get("/api/push/admin/next").header("X-Ops-Authenticated", "1")
                .header("X-Forwarded-For", "127.0.0.1")
                .with(request -> { request.setRemoteAddr("203.0.113.5"); return request; }))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void passesAuthenticatedSelectionAndDateToNotificationService() throws Exception {
        var mvc = mvc();
        mvc.perform(get("/api/push/admin/next?date=2026-10-08").header("X-Ops-Authenticated", "1"))
                .andExpect(status().isOk());
        verify(service).next(LocalDate.parse("2026-10-08"));
        mvc.perform(put("/api/push/admin/next?date=2026-10-08").header("X-Ops-Authenticated", "1")
                .contentType(MediaType.APPLICATION_JSON).content("{\"mode\":\"replace\",\"offerId\":\"selected-id\"}"))
                .andExpect(status().isOk());
        verify(service).update(LocalDate.parse("2026-10-08"), "replace", "selected-id");
    }
}
