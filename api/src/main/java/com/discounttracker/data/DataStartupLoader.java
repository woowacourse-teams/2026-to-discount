package com.discounttracker.data;

import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.ApplicationArguments;
import org.springframework.stereotype.Component;

// 앱 시작 시 export.json을 한 번 읽어 캐시를 채운다.
@Component
public class DataStartupLoader implements ApplicationRunner {

    private final ExportDataLoader loader;

    public DataStartupLoader(ExportDataLoader loader) {
        this.loader = loader;
    }

    @Override
    public void run(ApplicationArguments args) {
        loader.reload();
    }
}
