package com.discounttracker.web;

import com.discounttracker.analytics.ClientFingerprint;
import com.discounttracker.analytics.ReportAdminController;
import com.discounttracker.analytics.ReportController;
import com.discounttracker.analytics.ReportLedger;
import com.discounttracker.analytics.SlackReporter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({ReportController.class, ReportAdminController.class})
@Import(WebConfig.class)
class ReportCorsTest {
    private static final String PREVIEW = "https://beggars-git-x-nn98s-projects.vercel.app";
    private static final String CONSOLE = "https://bebeggars.duckdns.org";
    @Autowired MockMvc mvc;
    @MockitoBean SlackReporter slack;
    @MockitoBean ClientFingerprint fingerprint;
    @MockitoBean ReportLedger ledger;

    @Test
    void previewMayReadMineWithVisitorHeader() throws Exception {
        mvc.perform(options("/api/reports/mine").header("Origin", PREVIEW)
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "x-visitor-id"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", PREVIEW));
    }

    @Test
    void consoleMayPutStatusButPreviewMayNot() throws Exception {
        String path = "/api/admin/reports/r_0123456789abcdef";
        mvc.perform(options(path).header("Origin", CONSOLE).header("Access-Control-Request-Method", "PUT")
                .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", CONSOLE));
        mvc.perform(options(path).header("Origin", PREVIEW).header("Access-Control-Request-Method", "PUT"))
                .andExpect(status().isForbidden());
    }
}
