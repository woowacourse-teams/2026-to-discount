package com.discounttracker.web;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class RequestIdFilterTest {
    private final RequestIdFilter filter = new RequestIdFilter();
    private static final String ID = "0123456789abcdef0123456789abcdef";

    @AfterEach
    void clearMdc() { MDC.clear(); }

    @Test
    void preservesIdDuringProcessingAndRestoresOuterContext() throws Exception {
        MDC.put("requestId", "outer");
        var request = new MockHttpServletRequest("GET", "/api/brands");
        request.addHeader("X-Request-ID", ID);
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> assertEquals(ID, MDC.get("requestId")));
        assertEquals(ID, response.getHeader("X-Request-ID"));
        assertEquals("outer", MDC.get("requestId"));
    }

    @Test
    void generatesIdForMissingMalformedAndMultipleHeaders() throws Exception {
        for (String value : new String[]{"", "bad", "A".repeat(32), ID + ", " + ID}) {
            var request = new MockHttpServletRequest();
            if (!value.isEmpty()) request.addHeader("X-Request-ID", value);
            assertGenerated(request);
        }
        var multiple = new MockHttpServletRequest();
        multiple.addHeader("X-Request-ID", ID);
        multiple.addHeader("X-Request-ID", ID);
        assertGenerated(multiple);
    }

    private void assertGenerated(MockHttpServletRequest request) throws Exception {
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> {
            assertTrue(MDC.get("requestId").matches("[0-9a-f]{32}"));
            assertNotEquals(ID, MDC.get("requestId"));
        });
        assertTrue(response.getHeader("X-Request-ID").matches("[0-9a-f]{32}"));
        assertNull(MDC.get("requestId"));
    }

    @Test
    void clearsMdcAfterUnhandledFailureAndNextRequestGetsNewId() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", ID);
        var response = new MockHttpServletResponse();
        assertThrows(ServletException.class, () -> filter.doFilter(request, response, (req, res) -> {
            assertEquals(ID, MDC.get("requestId"));
            throw new ServletException("failure");
        }));
        assertNull(MDC.get("requestId"));
        assertGenerated(new MockHttpServletRequest());
    }

    @Test
    void keepsSameIdOnErrorAndAsyncRedispatch() throws Exception {
        for (var dispatch : new DispatcherType[]{DispatcherType.ERROR, DispatcherType.ASYNC}) {
            var request = new MockHttpServletRequest();
            request.addHeader("X-Request-ID", ID);
            filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {});
            request.setDispatcherType(dispatch);
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, res) -> assertEquals(ID, MDC.get("requestId")));
            assertEquals(ID, response.getHeader("X-Request-ID"));
            assertNull(MDC.get("requestId"));
        }
    }

    @Test
    void reappliesHeaderAndMdcOnNestedErrorDispatch() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", ID);
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            request.setDispatcherType(DispatcherType.ERROR);
            var errorResponse = new MockHttpServletResponse();
            filter.doFilter(request, errorResponse, (nestedReq, nestedRes) -> {
                assertEquals(ID, MDC.get("requestId"));
                errorResponse.setStatus(500);
            });
            assertEquals(ID, errorResponse.getHeader("X-Request-ID"));
            assertEquals(ID, MDC.get("requestId"));
        });
        assertNull(MDC.get("requestId"));
    }

    @Test
    void concurrentRequestsNeverShareContext() throws Exception {
        var entered = new CountDownLatch(2);
        var executor = Executors.newFixedThreadPool(2);
        try {
            var first = executor.submit(() -> concurrentRequest(ID, entered));
            var second = executor.submit(() -> concurrentRequest("a".repeat(32), entered));
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
        } finally { executor.shutdownNow(); }
    }

    private Void concurrentRequest(String id, CountDownLatch entered) throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Request-ID", id);
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            entered.countDown();
            try { assertTrue(entered.await(3, TimeUnit.SECONDS)); }
            catch (InterruptedException e) { throw new ServletException(e); }
            assertEquals(id, MDC.get("requestId"));
        });
        assertNull(MDC.get("requestId"));
        return null;
    }
}
