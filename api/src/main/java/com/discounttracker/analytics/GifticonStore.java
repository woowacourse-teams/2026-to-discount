package com.discounttracker.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 기프티콘 코드를 담아 두고 하나씩 꺼내 준다.
 *
 * <p>프론트 번들에 넣지 않는 이유는 명백하다 — 값을 가진 문자열이라 누구나
 * 읽어 간다. 저장소에도 올리지 않는다({@code .gitignore}). 경로만 열어두고
 * ({@code discount.gifticons-path}) 파일은 서버에 직접 올린다 —
 * {@code banners.yml}·{@code export.json}과 같은 방식이다(ADR-001).
 *
 * <p>발급은 두 번 나가면 안 된다. 서버가 단일 인스턴스이므로 이 객체의
 * 잠금 하나면 충분하다 — 여러 인스턴스로 늘리면 파일 잠금이나 DB가 필요해진다.
 */
@Component
public class GifticonStore {

    private static final Logger log = LoggerFactory.getLogger(GifticonStore.class);

    private final Path path;

    public GifticonStore(@Value("${discount.gifticons-path:data/gifticons.yml}") String path) {
        this.path = Path.of(path);
    }

    Path path() {
        return path;
    }

    /** 아직 아무에게도 안 나간 코드 수. 0이면 프론트가 설문을 안 그린다. */
    public synchronized int remaining() {
        return (int) read().stream().filter(g -> g.get("issuedTo") == null).count();
    }

    /**
     * 코드 하나를 꺼내 발급 표시를 하고 돌려준다.
     *
     * <p>읽기 → 표시 → 쓰기가 한 덩어리라야 한다. 나눠 두면 두 요청이 같은
     * 코드를 집는다. {@code synchronized}로 묶고, 파일에 다 쓴 뒤에야 코드를
     * 돌려준다 — 먼저 돌려주고 쓰다 실패하면 같은 코드가 다음 사람에게도 간다.
     */
    public synchronized Optional<String> issue(String visitorId) {
        List<Map<String, Object>> all = read();
        for (Map<String, Object> g : all) {
            if (g.get("issuedTo") != null) continue;
            Object code = g.get("code");
            if (code == null) continue;

            g.put("issuedTo", visitorId);
            g.put("issuedAt", OffsetDateTime.now(Clock.systemDefaultZone()).toString());
            try {
                write(all);
            } catch (IOException e) {
                // 못 적었으면 발급하지 않은 것으로 둔다. 코드를 주고 기록을
                // 못 남기면 같은 코드가 다음 사람에게도 나간다.
                log.error("기프티콘 발급 기록에 실패했다 — 코드를 내주지 않는다: {}", path, e);
                return Optional.empty();
            }
            return Optional.of(String.valueOf(code));
        }
        return Optional.empty();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> read() {
        // 파일이 없는 것은 오류가 아니다 — 아직 안 올렸거나 다 소진한 상태다.
        // 어느 쪽이든 "남은 코드 0"이고, 그러면 설문이 저절로 내려간다.
        if (!Files.exists(path)) return List.of();
        try (InputStream in = Files.newInputStream(path)) {
            Object loaded = new Yaml().load(in);
            if (!(loaded instanceof Map<?, ?> root)) return List.of();
            Object list = root.get("gifticons");
            if (!(list instanceof List<?> raw)) return List.of();

            List<Map<String, Object>> out = new ArrayList<>();
            for (Object item : raw) {
                if (item instanceof Map<?, ?> m) out.add(new LinkedHashMap<>((Map<String, Object>) m));
            }
            return out;
        } catch (IOException | RuntimeException e) {
            log.error("gifticons.yml을 읽지 못했다 — 남은 코드 0으로 본다: {}", path, e);
            return List.of();
        }
    }

    private void write(List<Map<String, Object>> all) throws IOException {
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setAllowUnicode(true);
        String text = new Yaml(options).dump(Map.of("gifticons", all));

        if (path.getParent() != null) Files.createDirectories(path.getParent());
        // 임시 파일에 다 쓴 뒤 옮긴다. 쓰는 도중에 죽어도 원본이 반쪽으로
        // 남지 않는다 — 반쪽이면 남은 코드가 통째로 날아간다.
        Path tmp = path.resolveSibling(path.getFileName() + ".tmp");
        Files.writeString(tmp, text, StandardCharsets.UTF_8);
        Files.move(tmp, path, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }
}
