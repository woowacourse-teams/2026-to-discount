package com.discounttracker.web;

import com.discounttracker.push.NewOfferNotificationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import java.time.LocalDate;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PushAdminController.class)
@Import(WebConfig.class)
class PushAdminCorsTest {
    private static final String ORIGIN = "https://bebeggars.duckdns.org";
    private static final String PATH = "/api/push/admin/next";
    @Autowired MockMvc mvc;
    @MockitoBean NewOfferNotificationService service;

    @Test
    void allowsConsoleReadThroughInternalProxy() throws Exception {
        mvc.perform(get(PATH).header("Origin", ORIGIN).header("X-Ops-Authenticated", "1")
                .with(request -> { request.setRemoteAddr("127.0.0.1"); return request; }))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        verify(service).next(null);
    }

    @Test
    void allowsConsoleReplacementThroughInternalProxy() throws Exception {
        mvc.perform(put(PATH + "?date=2026-10-12").header("Origin", ORIGIN)
                .header("X-Ops-Authenticated", "1").contentType(MediaType.APPLICATION_JSON)
                .content("{\"mode\":\"replace\",\"offerId\":\"selected-id\"}")
                .with(request -> { request.setRemoteAddr("127.0.0.1"); return request; }))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        verify(service).update(LocalDate.parse("2026-10-12"), "replace", "selected-id");
    }

    @Test
    void allowsConsolePutPreflight() throws Exception {
        mvc.perform(options(PATH).header("Origin", ORIGIN)
                .header("Access-Control-Request-Method", "PUT")
                .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", ORIGIN));
        verifyNoInteractions(service);
    }

    @Test
    void rejectsUntrustedOriginEvenWithProxyMarker() throws Exception {
        mvc.perform(put(PATH).header("Origin", "https://evil.example.com")
                .header("X-Ops-Authenticated", "1").contentType(MediaType.APPLICATION_JSON)
                .content("{\"mode\":\"exclude\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void stillRequiresAuthenticationForAllowedOrigin() throws Exception {
        mvc.perform(put(PATH).header("Origin", ORIGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"mode\":\"exclude\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void doesNotAllowPutOnPublicApiPaths() throws Exception {
        mvc.perform(options("/api/brands").header("Origin", "https://beggars-five.vercel.app")
                .header("Access-Control-Request-Method", "PUT"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
}
