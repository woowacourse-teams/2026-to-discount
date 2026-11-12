# 2026-11-12 API 429 440건: 설문 폴링

## 결론

17:06~17:44에 `/api/` 요청 440건이 nginx 429(`limit_req`)로 막혔다. 같은 공유기 뒤 여러 기기가 설문 상태(`GET /api/survey`)를 5초 주기로 다시 물어 IP 하나로 합산됐다. 서버 결함이 아니라 프론트 호출 패턴이다.

## 확인한 것 (서버 nginx 로그, 2026-11-11 00:00~11-12 23:35)

- 429 440건 전부 11-12 17:06~17:44. 17:43 한 분에 113건.
- 경로: `/api/survey` 412건, `POST /api/events` 15건, 나머지 `/api/banners`, `/api/brands/*/history`.
- IP: 430건이 한 대역(같은 NAT 추정), 10건이 다른 대역. UA는 Windows, Pixel, Mac이 섞여 있다.
- 설정: `nginx.conf`의 `limit_req_zone ... zone=api_limit rate=60r/m`, `location /`에 `burst=20 nodelay`. `/ops/`에는 제한이 없어 이번 429와 무관하다.
- 같은 대역에서 `/api/survey`가 17시대에 1,216건은 200으로 통과했다.

## 조치

- `web/src/useSurvey.js`: 상태 재조회와 실패 재시도를 5초 고정 6회에서 5, 10, 20, 40초 간격 5회로 늦췄다. 429도 같은 경로로 들어와 두드리지 않는다.
- nginx 한도는 올리지 않았다. 정상 사용자 한도(분당 49건) 안의 설계이고, 공유기 뒤 다기기는 호출을 줄이는 쪽이 맞다.

## 5xx 6건(전부 504)

- `GET /ops/backup` 4건(11-11): `proxy_read_timeout 30s`를 백업 응답이 넘겼다. 콘솔에서 사람이 호출한 것이다.
- `POST /ph/batch/` 2건(11-11, 11-12): nginx가 PostHog로 프록시하는 경로에서 upstream이 시간 초과. 외부 지연이다.
- 같은 시각 `delivery-discount-api` 로그에 오류가 없다. 앱 자체의 5xx는 없다.

## 인증서

- bebeggars.duckdns.org 2026-12-25, turbom.duckdns.org 2026-12-17 만료(Let's Encrypt).
- `certbot.timer`가 하루 두 번 돌고(마지막 11-12 13:37 성공) 두 인증서 모두 nginx 인증자다. `certbot renew --dry-run`이 둘 다 성공했다. 따로 할 일은 없다.

## `/ops/state.json` 폴링 (미조치)

- 전체 요청의 약 18%(8,731건). 운영 콘솔을 연 브라우저의 `console.js`가 `setInterval(tick, 5000)`으로 `no-store` 호출한다.
- `state.json`은 수집 실행 중에만 바뀌므로 15~30초로 늘리거나 `document.hidden`일 때 멈춰도 신선도 손실이 작다. `console.js`는 서버의 `/var/www/ops/`에 있어 이 저장소가 아니라 수집 쪽 저장소에서 고친다.
- 분당 3건이 같은 초에 몰려 오는 별도 호출의 정체는 확인하지 못했다.
