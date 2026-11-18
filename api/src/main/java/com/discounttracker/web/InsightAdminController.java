package com.discounttracker.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * /insight E 구역(사용자 반응) 집계. 행동 지표는 공개하지 않아 운영 콘솔 인증 뒤에 둔다(#403 설계 §7).
 * 파일은 scripts/insight_behavior.py가 만든 것 그대로 내려준다. 바뀌면(수정 시각) 다시 읽는다.
 * 위치는 discount.behavior-path, 비우면 이벤트 원장(discount.event-log-path)과 같은 폴더의 behavior.json.
 */
@RestController
@RequestMapping("/api/admin/insight")
public class InsightAdminController {

    private final Path source;
    private final JsonMapper mapper = JsonMapper.builderWithJackson2Defaults().build();
    private volatile long loadedAt = -1;
    private volatile JsonNode cached;

    public InsightAdminController(@Value("${discount.behavior-path:}") String behaviorPath,
                                  @Value("${discount.event-log-path}") String eventLogPath) {
        this.source = behaviorPath.isBlank()
                ? Path.of(eventLogPath).toAbsolutePath().resolveSibling("behavior.json")
                : Path.of(behaviorPath);
    }

    @GetMapping("/behavior")
    public Object behavior(HttpServletRequest request) {
        OpsAuth.require(request);
        return load();
    }

    // ponytail: 요청마다 수정 시각만 본다. 파일은 하루 한 번 바뀌어 이 정도면 충분.
    private synchronized Object load() {
        try {
            if (!Files.isRegularFile(source)) return Map.of("available", false);
            long mtime = Files.getLastModifiedTime(source).toMillis();
            if (cached == null || mtime != loadedAt) {
                JsonNode tree;
                try (InputStream in = Files.newInputStream(source)) {
                    tree = mapper.readTree(in);
                }
                // 빈 파일이면 readTree가 예외 없이 빈 노드를 준다. 객체가 아니면 캐시하지 않는다.
                if (!tree.isObject()) return Map.of("available", false);
                cached = tree;
                loadedAt = mtime;
            }
            return cached;
        } catch (Exception e) {
            return Map.of("available", false);
        }
    }
}
