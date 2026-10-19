package com.discounttracker.web;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "discount.cors.development-origin=https://to-discount-dev.vercel.app")
class DevelopmentCorsTest {
    @Autowired MockMvc mvc;

    @Test
    void allowsDevelopmentReadAndWritePreflight() throws Exception {
        mvc.perform(get("/api/brands").header("Origin", "https://to-discount-dev.vercel.app"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://to-discount-dev.vercel.app"));
        mvc.perform(options("/api/events").header("Origin", "https://to-discount-dev.vercel.app")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk());
    }

    @Test
    void retainsProductionOriginAndRejectsUnknownOrigin() throws Exception {
        mvc.perform(get("/api/brands").header("Origin", "https://beggars-five.vercel.app"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/brands").header("Origin", "https://unapproved.example"))
                .andExpect(status().isForbidden());
    }
}
