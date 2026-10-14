# 개발 웹 배포

이슈 #53. dev 브랜치의 웹 변경은 deploy-web-dev.yml이 검증한 뒤 to-discount-dev.vercel.app에 배포한다. main 미러링은 유지한다.

## 최초 설정

1. GitHub development 환경에 VERCEL_DEV_TOKEN, VERCEL_DEV_ORG_ID, VERCEL_DEV_PROJECT_ID를 시크릿으로 등록한다. 개발 프로젝트와 팀의 ID를 사용하고 토큰에는 필요한 팀 배포 권한만 부여한다.
   기본 개발 주소가 공개여도 고유 배포 URL은 보호될 수 있다. 보호된 프로젝트는 Protection Bypass for Automation 값을 VERCEL_DEV_AUTOMATION_BYPASS_SECRET에 등록한다. CI는 이 값이 있으면 요청 헤더로 전달하고, 없으면 기존 토큰의 vercel curl을 시도한다. 현재 개발 프로젝트는 명시적 우회 시크릿이 필요하다.
2. development 환경의 허용 배포 브랜치를 dev로 제한한다.
3. 개발 Vercel Production에 VITE_APP_ENV=development, VITE_API_BASE_URL=https://dev-api-todiscount.duckdns.org, SITE_ORIGIN=https://to-discount-dev.vercel.app을 설정한다. Actions도 동일한 공개 값을 사용한다. 기존 PostHog 등 필요한 값은 Vercel에서 관리하며 vercel pull로 빌드에 전달한다.
4. 첫 dev push 전에 개발 프로젝트의 Settings → Build and Deployment → Ignored Build Step에서 Don’t build anything(exit 0)을 저장한다. Git 연결은 유지하고 Actions의 prebuilt 배포만 사용한다. 저장소의 git.deploymentEnabled.dev=false도 이후 dev push 자동 배포를 차단한다. main 운영 프로젝트의 Git 연결은 바꾸지 않는다.
5. 개발 API systemd 환경에 DISCOUNT_CORS_DEVELOPMENT_ORIGIN=https://to-discount-dev.vercel.app을 등록하고 API 변경 배포 후 서비스에 반영한다. 운영에는 이 값을 지정하지 않는다.
6. dev에 변경을 반영한 뒤 Actions 실행 또는 dev에서 workflow_dispatch로 배포한다.

## 실행 순서

CLI의 pull, build, deploy는 모노레포 루트에서 실행한다. 프로젝트 Root Directory(web)가 중복 적용되지 않도록 한다. 테스트와 검증 스크립트만 web에서 실행한다. 승격은 팀과 프로젝트를 명시한 Vercel API로 요청하고 도메인 연결 완료까지 확인한다. CLI promote의 개인 사용자 조회에 의존하지 않는다.

npm test → vercel pull → vercel build --prod → 개발 주소 및 SSR 산출물 검사 → vercel deploy --prebuilt --prod --skip-domain → 신규 URL의 SSR 및 API CORS 검사 → 최신 dev SHA 확인 → Vercel API 승격 및 도메인 연결 완료 확인.

토큰 누락, 테스트, 빌드, CORS 및 SSR 오류는 배포 승격을 막는다. 새 커밋이 있으면 오래된 실행은 승격하지 않는다. Vercel Production 환경은 개발 프로젝트의 기본 배포 환경을 의미한다.

## 운영 연결

운영 Vercel에 VITE_APP_ENV=production과 VITE_API_BASE_URL=https://bebeggars.duckdns.org을 지정한다. 값이 없는 기존 운영 빌드도 같은 주소를 기본값으로 사용한다. 개발 설정은 값이 없거나 운영 API이면 오류를 발생시킨다. VITE 변수는 공개 설정이므로 비밀키를 넣지 않는다.

## 확인

npm test, npm run build, node scripts/verify-dev-output.mjs, DEPLOYMENT_URL=<새 배포 URL> node scripts/verify-dev-deployment.mjs.

브라우저의 API 요청은 개발 origin이어야 한다. SSR 실패 대체 화면도 개발 API로 사전 렌더링한 결과만 사용한다. 개발 API가 빌드 중 실패하면 빈 대체 화면을 사용하며 운영 API로 전환하지 않는다.
