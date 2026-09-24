package com.discounttracker.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.Map;

/**
 * 예외를 상태코드에 맞게 내보내고, <b>진짜 장애만</b> 로그로 남긴다.
 *
 * <p>이 클래스가 없을 때는 예외가 Spring 기본 처리로 500만 나가고 어디에도
 * 기록이 안 남았다 — badge 필드 추가 때 reload가 500 난 것(2026-08-03)도,
 * {@code "soldOut": null}로 reload가 깨진 것(2026-08-04)도 화면이 안 나와서야
 * 알았다.
 *
 * <p><b>다만 처음엔 {@code Exception} 하나만 잡아서 더 나빴다.</b> 정적
 * 리소스가 없을 때 나는 {@link org.springframework.web.servlet.resource.NoResourceFoundException}
 * (원래 404)까지 가로채 500으로 바꿔버렸고, 배포 후 30분 만에 로그가 이런
 * 것들로 찼다(2026-08-07 실측):
 *
 * <pre>
 * uri=/.env         ← 봇 스캔
 * uri=/.git/config  ← 봇 스캔
 * uri=/             ← 정적 리소스 없음(이 서버는 API 전용)
 * </pre>
 *
 * <p>인터넷에 열린 서버라 이런 스캔은 상시 들어온다. 그걸 ERROR
 * 스택트레이스로 쌓으면 정작 진짜 장애를 못 찾고, 나중에 에러 리포팅을
 * 붙이면 알림이 스캔으로 가득 찬다.
 *
 * <p>그래서 {@link ResponseEntityExceptionHandler}를 상속한다 — Spring이
 * 이미 의미를 아는 예외(404·405·400 등)는 제 상태코드를 그대로 유지하고,
 * 여기서는 <b>아무도 예상하지 못한 예외만</b> 500으로 처리하며 스택트레이스를
 * 남긴다.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 예상 못 한 예외만 여기로 온다. 스택트레이스를 남기는 게 핵심이다.
     *
     * <p>응답 본문에 예외 메시지를 넣지 않는다 — 내부 경로·파일명이 새어
     * 나갈 이유가 없다.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> onUnhandled(Exception e, WebRequest request) {
        if (clientWentAway(e)) {
            // 우리 잘못이 아니고 우리가 할 일도 없다. 응답을 쓰는 도중에 상대가 끊었다 -
            // 탭을 닫거나, 새로고침하거나, 모바일에서 전파가 끊기면 난다. 2026-09-24까지
            // 24시간에 두 번 났는데 ERROR에 스택까지 찍혀 진짜 장애처럼 보였다. 진짜
            // 오류가 이런 줄에 묻히면 안 된다. 한 줄로 남긴다.
            log.info("클라이언트가 응답을 받다 끊었다 — {}", request.getDescription(false));
            return null;                       // 이미 끊긴 연결에 다시 쓸 수 없다
        }
        log.error("처리되지 않은 예외 — {}", request.getDescription(false), e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "internal_error"));
    }

    /**
     * 클라이언트가 먼저 끊어서 난 예외인가.
     *
     * <p>클래스 이름으로 가린다. {@code ClientAbortException}(톰캣)과
     * {@code AsyncRequestNotUsableException}(스프링) 둘 다 원인은 하나, 끊긴 연결에
     * 쓰려 한 것이다. 원인 사슬을 따라가는 이유는 스프링이 톰캣 예외를 제 것으로
     * 감싸서 올리기 때문이다.
     */
    static boolean clientWentAway(Throwable e) {
        for (Throwable t = e; t != null && t != t.getCause(); t = t.getCause()) {
            String name = t.getClass().getSimpleName();
            if (name.equals("ClientAbortException") || name.equals("AsyncRequestNotUsableException")) {
                return true;
            }
            if (t instanceof java.io.IOException && "Broken pipe".equals(t.getMessage())) return true;
        }
        return false;
    }

    /**
     * Spring이 의미를 아는 예외(404·405·400 등)의 로그 수위를 낮춘다.
     *
     * <p>없는 경로 요청은 장애가 아니라 일상이다 — 봇 스캔이 대부분이고
     * 우리가 할 일도 없다. 흔적은 남기되 DEBUG로 두어 평소 로그를 더럽히지
     * 않는다. 5xx는 우리 잘못이므로 WARN으로 올린다.
     */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode status, WebRequest request) {

        if (status.is5xxServerError()) {
            log.warn("서버 오류 응답 {} — {}", status, request.getDescription(false), ex);
        } else {
            log.debug("{} 응답 — {} ({})", status, request.getDescription(false), ex.getClass().getSimpleName());
        }
        return super.handleExceptionInternal(ex, body, headers, status, request);
    }

    /**
     * Spring 기본 오류 본문(ProblemDetail)에는 요청 경로와 내부 설명이 들어간다
     * (예: {@code "detail": "No static resource .env."}). 스캐너에게 굳이
     * 되돌려줄 이유가 없어 본문을 비운다 — 상태코드만 나간다.
     */
    @Override
    protected ResponseEntity<Object> createResponseEntity(
            Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        return new ResponseEntity<>(body instanceof ProblemDetail ? null : body, headers, statusCode);
    }
}
