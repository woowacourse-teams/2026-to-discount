package com.discounttracker.data;

import com.discounttracker.model.OfferRecord;
import tools.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@Component
public class ExportDataLoader {

    private final Resource exportResource;
    private final ObjectMapper mapper = new ObjectMapper();
    private volatile List<OfferRecord> cache = List.of();

    public ExportDataLoader(@Value("${discount.export-path}") Resource exportResource) {
        this.exportResource = exportResource;
    }

    public void reload() {
        if (!exportResource.exists()) {
            cache = List.of();
            return;
        }
        try (InputStream in = exportResource.getInputStream()) {
            cache = List.of(mapper.readValue(in, OfferRecord[].class));
        } catch (IOException e) {
            throw new IllegalStateException("export.json 읽기 실패", e);
        }
    }

    public List<OfferRecord> records() {
        return cache;
    }
}
