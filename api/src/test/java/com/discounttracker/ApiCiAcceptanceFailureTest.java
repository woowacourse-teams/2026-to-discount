package com.discounttracker;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.fail;

class ApiCiAcceptanceFailureTest {

    @Test
    void intentionallyFailsForApiCiAcceptanceTest() {
        fail("intentional failure for API CI acceptance test");
    }
}
