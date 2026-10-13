package com.discounttracker.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Collections;
import java.util.UUID;
import java.util.regex.Pattern;

public class RequestIdFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-Request-ID";
    public static final String MDC_KEY = "requestId";
    private static final String ATTRIBUTE = RequestIdFilter.class.getName() + ".id";
    private static final Pattern VALID_ID = Pattern.compile("[0-9a-f]{32}");
    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);

    @Override
    protected boolean shouldNotFilterAsyncDispatch() { return false; }

    @Override
    protected boolean shouldNotFilterErrorDispatch() { return false; }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                  FilterChain chain) throws ServletException, IOException {
        withRequestId(request, response, chain);
    }

    @Override
    protected void doFilterNestedErrorDispatch(HttpServletRequest request, HttpServletResponse response,
                                             FilterChain chain) throws ServletException, IOException {
        withRequestId(request, response, chain);
    }

    private void withRequestId(HttpServletRequest request, HttpServletResponse response,
                               FilterChain chain) throws ServletException, IOException {
        String id = (String) request.getAttribute(ATTRIBUTE);
        if (id == null) {
            var values = Collections.list(request.getHeaders(HEADER));
            id = values.size() == 1 && VALID_ID.matcher(values.get(0)).matches()
                    ? values.get(0) : UUID.randomUUID().toString().replace("-", "");
            request.setAttribute(ATTRIBUTE, id);
        }
        String previous = MDC.get(MDC_KEY);
        MDC.put(MDC_KEY, id);
        if (!response.isCommitted()) response.setHeader(HEADER, id);
        boolean failed = true;
        try {
            chain.doFilter(request, response);
            failed = false;
        } finally {
            try {
                // 비동기 처리는 마지막 dispatch에서 기록한다. 쿼리와 본문은 기록하지 않는다.
                if (!request.isAsyncStarted()) {
                    log.info("HTTP 요청 완료: method={} path={} status={}",
                            safe(request.getMethod()), safe(request.getRequestURI()),
                            failed ? 500 : response.getStatus());
                }
            } finally {
                if (previous == null) MDC.remove(MDC_KEY);
                else MDC.put(MDC_KEY, previous);
            }
        }
    }

    private static String safe(String value) {
        String line = value.replace('\r', '_').replace('\n', '_');
        return line.substring(0, Math.min(line.length(), 512));
    }
}
