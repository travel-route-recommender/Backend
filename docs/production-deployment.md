# 운영 배포 체크리스트

코드에는 환경변수 검증, 보안 헤더, CORS 제한, 요청 제한, 운영 Swagger 비활성화,
MongoDB readiness 체크, CI와 Render Blueprint가 반영되어 있다.

## Render에서 직접 확인할 항목

- 기존 서비스 이름이 `backend-1`인지 확인한 뒤 `render.yaml`을 기존 서비스에 연결한다.
- `MONGODB_URI`, `APP_BASE_URL`, `KAKAO_REST_API_KEY`,
  `TOUR_API_SERVICE_KEY` 값을 Secret으로 등록한다.
- Health Check Path가 `/api/v1/health/ready`인지 확인한다.
- 무료 인스턴스의 슬립으로 운영 API가 지연되지 않도록 상시 실행 플랜을 사용한다.
- 배포 알림과 로그 보존 정책을 설정한다.

`APP_BASE_URL`은 `https://backend-1-e3sv.onrender.com`처럼 HTTPS origin만 입력한다.
React Native 요청은 Origin 헤더가 없으므로 `CORS_ORIGINS`가 비어 있어도 동작한다.
웹 클라이언트가 있으면 해당 HTTPS origin만 쉼표로 구분해 등록한다.

## MongoDB Atlas에서 직접 확인할 항목

- 운영 전용 DB 사용자와 최소 권한을 사용한다.
- Atlas Network Access에 Render 서비스의 outbound IP 대역만 허용한다.
- 자동 백업과 복구 보존 기간을 설정하고 실제 복구 테스트를 수행한다.
- 모니터링/알림에서 연결 수, 저장공간, 느린 쿼리를 확인한다.

## 아직 인프라 선택이 필요한 항목

- 현재 업로드는 로컬 `uploads` 디렉터리를 사용한다. Render 기본 파일시스템은
  재배포 시 보존되지 않으므로, 운영 전에는 Object Storage로 이전하거나 Persistent
  Disk를 `/opt/render/project/src/uploads`에 연결해야 한다.
- 인스턴스를 두 개 이상 실행하면 기본 요청 제한 저장소가 인스턴스별로 분리된다.
  다중 인스턴스 전에는 Redis 기반 throttler storage 또는 엣지 rate limit을 적용한다.
- 프론트엔드 빌드나 저장소 이력에 노출된 API 키가 있다면 폐기 후 재발급한다.

## 배포 순서

1. `ios_release`의 CI 통과를 확인한다.
2. `ios_release`를 `main`에 병합한다.
3. Render 배포 로그에서 build와 readiness 성공을 확인한다.
4. `/api/v1/health/ready`가 200인지 확인한다.
5. 신규 테스트 계정으로 가입, 로그인, 토큰 갱신, 계정 삭제를 검증한다.
