# 백엔드

|            |               |
| ---------- | ------------- |
| **Person** | _담당자 이름_ |
| **Status** | In progress   |
| **Repo**   | `Backend/`    |

---

## 링크

| 항목               | URL                                                    |
| ------------------ | ------------------------------------------------------ |
| API Swagger (로컬) | http://localhost:3000/api/docs                         |
| Base URL (로컬)    | http://localhost:3000/api/v1                           |
| JWT Debugger       | https://jwt.io/                                        |
| 배포 도메인        | _미배포_                                               |
| 논의 체크리스트    | [`DISCUSSION_CHECKLIST.md`](./DISCUSSION_CHECKLIST.md) |

---

## 개요

### 만들어야 되는 서버

TripMatch / Tourmate **메인 REST API 서버**

- **Stack:** NestJS 11 · MongoDB (Mongoose) · JWT (access + refresh) · 캐시: 메모리 + Redis(`REDIS_URL`, optional)
- **역할:** 계정/인증, 두리 테스트, 여행방, 후보·일정, 장소 검색, rule-based 매칭·제안

### 메인 백엔드 — MongoDB에 저장돼야 할 것

| 컬렉션             | 저장 내용                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `users`            | email, oauth, nickname, travelType, quizAnswers, onboardingCompleted, isGuest, refreshTokens     |
| `travel_rooms`     | title, destination, dates, status, members, inviteCode, candidatePlaces, schedule, scheduleStyle |
| `places`           | 장소 (Kakao cache + manual seed), tags, popularityScore                                          |
| `user_saves`       | 유저 개인 Save (placeId, optional roomId)                                                        |
| `analysis_reports` | 두리 분석 리포트 (route, budget, density 등)                                                     |

### 모듈 분리

| 모듈         | Prefix                | 역할                                                    |
| ------------ | --------------------- | ------------------------------------------------------- |
| Auth         | `/auth`               | 회원가입, 로그인, refresh, Kakao OAuth, guest 초대 입장 |
| Users        | `/users`              | 프로필, travelType, 온보딩                              |
| User Saves   | `/users/me/saves`     | 탐색 Save (room 후보와 분리)                            |
| Quiz         | `/quiz`               | 두리 테스트 8문항                                       |
| Rooms        | `/rooms`              | 여행방 CRUD, 후보, 일정, 궁합, 코스                     |
| Invites      | `/invites`            | 초대 수락                                               |
| Duri         | `/rooms/:roomId/duri` | 공유 성향 조회·근거 기반 분석 리포트                    |
| Mobility     | `/mobility`           | Kakao Mobility 자동차 경로·이동시간 BFF                 |
| Places       | `/places`             | 장소 검색·상세·유사                                     |
| Destinations | `/destinations`       | 인기 여행지                                             |

---

## API 기능들 개발

> **상태 범례**
>
> - `완료` — 실로직 구현됨
> - `시작 전` — 미구현

### Auth

| 이름                    | 상태    | Method | Path                   | 인증      | description                                            |
| ----------------------- | ------- | ------ | ---------------------- | --------- | ------------------------------------------------------ |
| 이메일 회원가입         | 완료    | POST   | `/auth/signup`         | ❌        | nickname, email, password → accessToken + refreshToken |
| 이메일 로그인           | 완료    | POST   | `/auth/login`          | ❌        | email, password → tokens                               |
| 토큰 갱신               | 완료    | POST   | `/auth/refresh`        | ❌        | refreshToken → 새 accessToken                          |
| 로그아웃                | 완료    | POST   | `/auth/logout`         | ✅ Bearer | refreshToken DB에서 폐기                               |
| Kakao OAuth             | 완료    | POST   | `/auth/oauth/kakao`    | ❌        | Kakao accessToken → 유저 생성/조회                     |
| 초대 guest 입장         | 완료    | POST   | `/auth/join-by-invite` | ❌        | inviteCode + nickname → guest 유저 + roomId            |
| Google OAuth            | 시작 전 | —      | —                      | —         | Phase 2                                                |
| Apple OAuth             | 시작 전 | —      | —                      | —         | Phase 2                                                |
| guest → 정식 계정 merge | 시작 전 | —      | —                      | —         | 미정                                                   |

### Users

| 이름            | 상태 | Method | Path                            | 인증      | description                                       |
| --------------- | ---- | ------ | ------------------------------- | --------- | ------------------------------------------------- |
| 유저 목록       | 완료 | GET    | `/users`                        | ❌        | 전체 회원 PublicUser · page/limit/q · 인증 불필요 |
| 내 프로필       | 완료 | GET    | `/users/me`                     | ✅ Bearer | 전체 필드 + ongoing/completed 여행 수             |
| TravelType 조회 | 완료 | GET    | `/users/me/travel-type`         | ✅ Bearer | 두리 테스트 결과                                  |
| 여행 통계       | 완료 | GET    | `/users/me/trips-summary`       | ✅ Bearer | ongoing / completed count                         |
| 프로필 수정     | 완료 | PATCH  | `/users/me/profile`             | ✅ Bearer | nickname, profileImageUrl                         |
| 온보딩 완료     | 완료 | PATCH  | `/users/me/onboarding-complete` | ✅ Bearer | onboardingCompleted = true                        |

### User Saves (탐색 Save)

| 이름      | 상태 | Method | Path                       | 인증      | description                 |
| --------- | ---- | ------ | -------------------------- | --------- | --------------------------- |
| 저장 목록 | 완료 | GET    | `/users/me/saves`          | ✅ Bearer | roomId 없는 개인 save       |
| 장소 저장 | 완료 | POST   | `/users/me/saves`          | ✅ Bearer | placeId (+ optional roomId) |
| 저장 해제 | 완료 | DELETE | `/users/me/saves/:placeId` | ✅ Bearer |                             |

### Quiz (두리 테스트)

| 이름            | 상태       | Method | Path                          | 인증      | description                     |
| --------------- | ---------- | ------ | ----------------------------- | --------- | ------------------------------- |
| 스텝 메타       | 완료       | GET    | `/quiz/steps`                 | ❌        | challengeStyle~discovery        |
| 문항(스텝) 조회 | 완료       | GET    | `/quiz/questions`             | ❌        | 안내용                          |
| 예산 태그       | 완료       | GET    | `/quiz/tags`                  | ❌        | ranking 항목 + 제품 분류 선택지 |
| 진행 상태       | 완료       | GET    | `/quiz/status`                | ✅ Bearer | sessionId, answeredCount        |
| 성향 조회       | 완료       | GET    | `/quiz/me`                    | ✅ Bearer | axes + preferences + responses  |
| 세션 생성       | 완료       | POST   | `/quiz/sessions`              | ✅ Bearer | in_progress                     |
| 중간 저장       | 완료       | PATCH  | `/quiz/sessions/:id`          | ✅ Bearer | 챕터 partial merge              |
| 테스트 완료     | 완료       | POST   | `/quiz/sessions/:id/complete` | ✅ Bearer | FE 점수 저장 + TravelType       |
| 레거시 제출     | deprecated | POST   | `/quiz/submit`                | ✅ Bearer | 구 8문항                        |

### Places

공통 **CommonPlace** 형식 (`placeId`, `externalId`, `source`, `lat`/`lng`, …). Tour·Kakao·후보 `place` 동일.

| 이름      | 상태 | Method | Path                       | 인증 | description                     |
| --------- | ---- | ------ | -------------------------- | ---- | ------------------------------- |
| 장소 검색 | 완료 | GET    | `/places/search`           | ❌   | Kakao → DB upsert → CommonPlace |
| 장소 상세 | 완료 | GET    | `/places/:placeId`         | ❌   | CommonPlace                     |
| 유사 장소 | 완료 | GET    | `/places/:placeId/similar` | ❌   | tags/category 기준              |

### Destinations

| 이름        | 상태 | Method | Path                    | 인증 | description                        |
| ----------- | ---- | ------ | ----------------------- | ---- | ---------------------------------- |
| 인기 여행지 | 완료 | GET    | `/destinations/popular` | ❌   | popularityScore Top 10 (seed + DB) |

### Rooms — 여행방

| 이름             | 상태 | Method | Path                         | 인증      | description                       |
| ---------------- | ---- | ------ | ---------------------------- | --------- | --------------------------------- |
| 여행방 생성      | 완료 | POST   | `/rooms`                     | ✅ Bearer | title optional                    |
| 궁합 멤버로 생성 | 완료 | POST   | `/rooms/from-compatibility`  | ✅ Bearer | memberUserIds[]                   |
| 내 여행 목록     | 완료 | GET    | `/rooms/me?status=`          | ✅ Bearer | ongoing / completed 필터          |
| 여행방 상세      | 완료 | GET    | `/rooms/:roomId`             | ✅ Bearer |                                   |
| 여행방 요약      | 완료 | GET    | `/rooms/:roomId/summary`     | ✅ Bearer | 목록 카드용                       |
| 여행방 수정      | 완료 | PATCH  | `/rooms/:roomId`             | ✅ Bearer | title, startDate, endDate, status |
| 여행지 설정      | 완료 | PATCH  | `/rooms/:roomId/destination` | ✅ Bearer | name, lat, lng                    |
| 진행률           | 완료 | GET    | `/rooms/:roomId/progress`    | ✅ Bearer | 5단계 heuristic                   |
| 초대 링크 조회   | 완료 | GET    | `/rooms/:roomId/invite-link` | ✅ Bearer | 운영 HTTPS 초대 링크              |
| 초대코드 재발급  | 완료 | POST   | `/rooms/:roomId/invites`     | ✅ Bearer | owner만                           |
| 워크스pace       | 완료 | GET    | `/rooms/:roomId/workspace`   | ✅ Bearer | room + candidates + schedule      |

### Rooms — 궁합 / 매칭

| 이름          | 상태 | Method | Path                            | 인증      | description                 |
| ------------- | ---- | ------ | ------------------------------- | --------- | --------------------------- |
| 궁합 점수     | 완료 | GET    | `/rooms/:roomId/compatibility`  | ✅ Bearer | 2인 tag intersection        |
| 매칭 결과     | 완료 | GET    | `/rooms/:roomId/match-result`   | ✅ Bearer | compatibility 동일          |
| J/P 스타일    | 완료 | PATCH  | `/rooms/:roomId/schedule-style` | ✅ Bearer | jType / pType               |
| N명 그룹 궁합 | 완료 | GET    | `/rooms/:roomId/compatibility`  | ✅ Bearer | 모든 멤버 pairwise tag 평균 |

### Rooms — 후보 장소

| 이름        | 상태 | Method | Path                                  | 인증      | description         |
| ----------- | ---- | ------ | ------------------------------------- | --------- | ------------------- |
| 후보 목록   | 완료 | GET    | `/rooms/:roomId/candidates`           | ✅ Bearer | scheduled flag 포함 |
| 멤버별 후보 | 완료 | GET    | `/rooms/:roomId/candidates/by-member` | ✅ Bearer |                     |
| 공통 후보   | 완료 | GET    | `/rooms/:roomId/candidates/common`    | ✅ Bearer | 2명+ 겹치는 place   |
| 탐색 후보   | 완료 | GET    | `/rooms/:roomId/candidates/explore`   | ✅ Bearer |                     |
| 후보 추가   | 완료 | POST   | `/rooms/:roomId/candidates`           | ✅ Bearer | placeId, note       |
| 후보 삭제   | 완료 | DELETE | `/rooms/:roomId/candidates/:placeId`  | ✅ Bearer | 본인 것만           |

### Rooms — 일정표

| 이름                | 상태 | Method                | Path                                                      | 인증      | description                            |
| ------------------- | ---- | --------------------- | --------------------------------------------------------- | --------- | -------------------------------------- |
| 일정 조회           | 완료 | GET                   | `/rooms/:roomId/schedule`                                 | ✅ Bearer |                                        |
| 지도용 일정         | 완료 | GET                   | `/rooms/:roomId/schedule/map`                             | ✅ Bearer | flat items                             |
| 일정 요약           | 완료 | GET                   | `/rooms/:roomId/schedule/summary`                         | ✅ Bearer | 태그·일별                              |
| 항목 추가           | 완료 | POST                  | `/rooms/:roomId/schedule/items`                           | ✅ Bearer | startTime/endTime = HH:mm              |
| 순서 변경           | 완료 | PATCH                 | `/rooms/:roomId/schedule/reorder`                         | ✅ Bearer | drag-drop                              |
| 항목 수정           | 완료 | PATCH                 | `/rooms/:roomId/schedule/items/:itemId`                   | ✅ Bearer |                                        |
| 항목 삭제           | 완료 | DELETE                | `/rooms/:roomId/schedule/items/:itemId`                   | ✅ Bearer |                                        |
| 입장권 목록         | 완료 | GET                   | `/rooms/:roomId/schedule/items/:itemId/tickets`           | ✅ Bearer |                                        |
| 입장권 업로드       | 완료 | POST                  | `/rooms/:roomId/schedule/items/:itemId/tickets`           | ✅ Bearer | multipart `image` · `/uploads`         |
| 입장권 삭제         | 완료 | DELETE                | `/rooms/:roomId/schedule/items/:itemId/tickets/:ticketId` | ✅ Bearer |                                        |
| batch 저장          | 완료 | PUT                   | `/rooms/:roomId/schedule`                                 | ✅ Bearer | days[] 일괄 · tickets는 item id로 유지 |
| 잠금                | 완료 | PATCH                 | `/rooms/:roomId/schedule/items/:itemId/lock`              | ✅ Bearer | expectedVersion                        |
| 확정 예약           | 완료 | PUT/DELETE            | `/rooms/:roomId/schedule/items/:itemId/reservation`       | ✅ Bearer |                                        |
| 계획 앵커           | 완료 | GET/PATCH             | `/rooms/:roomId/planning`                                 | ✅ Bearer | 숙소·복귀·timezone·버퍼                |
| 여행 날짜 원자 변경 | 완료 | PATCH                 | `/rooms/:roomId/trip-dates`                               | ✅ Bearer | 날짜+일정 한 커밋                      |
| 제안 적용           | 완료 | POST                  | `/rooms/:roomId/schedule/apply`                           | ✅ Bearer | factsVersion 선택                      |
| 분석 기준           | 완료 | GET                   | `/rooms/:roomId/analysis-baseline`                        | ✅ Bearer |                                        |
| 성향 공유           | 완료 | GET                   | `/rooms/:roomId/preferences`                              | ✅ Bearer | 파생값만                               |
| 제약 새로고침       | 완료 | POST                  | `/rooms/:roomId/preferences/refresh-constraints`          | ✅ Bearer |                                        |
| 후보 선호 신호      | 완료 | PUT                   | `/rooms/:roomId/candidates/:placeId/signals`              | ✅ Bearer |                                        |
| 공유 TODO           | 완료 | GET/POST/PATCH/DELETE | `/rooms/:roomId/todos`                                    | ✅ Bearer | revision                               |
| 공유 문서           | 완료 | GET/POST/DELETE       | `/rooms/:roomId/documents`                                | ✅ Bearer | 서명 URL                               |
| 서명 다운로드       | 완료 | POST/GET              | `/rooms/:id/files/signed-url`, `/files/download`          | ✅/token  |                                        |
| priority 로직       | 완료 | 일정 저장·제안 적용   | `/rooms/:roomId/schedule*`                                | ✅ Bearer | must·잠금·확정 예약·티켓 보호          |

### Invites

| 이름      | 상태 | Method | Path                    | 인증      | description         |
| --------- | ---- | ------ | ----------------------- | --------- | ------------------- |
| 초대 링크 열기 | 완료 | GET | `/invites/:code` | ❌ | 앱 연결용 HTTPS 안내 페이지 |
| 초대 수락 | 완료 | POST   | `/invites/:code/accept` | ✅ Bearer | 기존 유저 room join |

### Duri (두리 AI)

| 이름             | 상태 | Method | Path                                         | 인증      | description                              |
| ---------------- | ---- | ------ | -------------------------------------------- | --------- | ---------------------------------------- |
| 공유 취향 조회   | 완료 | POST   | `/rooms/:roomId/duri/reflect-preferences`    | ✅ Bearer | 현재 방의 파생 성향·후보 의견            |
| 분석 리포트 생성 | 완료 | POST   | `/rooms/:roomId/duri/analysis-report`        | ✅ Bearer | 근거가 있는 자동차 경로·겹침·성향만 분석 |
| 최신 리포트      | 완료 | GET    | `/rooms/:roomId/duri/analysis-report/latest` | ✅ Bearer |                                          |
| 자동차 길찾기    | 완료 | POST   | `/mobility/directions`                       | ✅ Bearer | REST 키 · 막차 미포함                    |

---

## 개발

### 로컬 실행

```bash
cd Backend
cp .env.example .env   # MONGODB_URI, JWT_* 설정
npm install
npm run start:dev
```

### 로그인 인증 (JWT)

1. `POST /auth/signup` 또는 `POST /auth/login` → `accessToken` + `refreshToken` 수신
2. 인증 필요 API → Header: `Authorization: Bearer {accessToken}`
3. access 만료 시 → `POST /auth/refresh` with `refreshToken`
4. 로그아웃 → `POST /auth/logout` with `refreshToken` (DB에서 제거)

| 토큰         | 만료 (기본) | 용도                           |
| ------------ | ----------- | ------------------------------ |
| accessToken  | 15m         | API 호출                       |
| refreshToken | 7d          | access 갱신 (DB 최대 5개 저장) |

### 프로젝트 플로우

```
회원가입/로그인
    ↓
GET /quiz/questions → POST /quiz/submit (TravelType)
    ↓
POST /rooms (여행방 생성)
    ↓
PATCH destination / dates
    ↓
POST /rooms/:id/candidates (후보 수집)
    ↓
GET /rooms/:id/compatibility (궁합)
    ↓
POST /rooms/:id/schedule/items (일정 작성)
    ↓
클라이언트 두리 엔진이 현재 서버 snapshot으로 분석·초안 생성
    ↓
POST /rooms/:id/schedule/apply (scheduleVersion + factsVersion 원자 검증)
```

### 인증 방식 요약

| API 그룹                                                                | Bearer 필요 |
| ----------------------------------------------------------------------- | ----------- |
| `/auth/signup`, `/login`, `/refresh`, `/join-by-invite`, `/oauth/kakao` | ❌          |
| `/quiz/questions`, `/places/*`, `/destinations/*`, `/tour/*`            | ❌          |
| `/mobility/*`, 그 외 인증 API                                           | ✅          |

---

## Memo

### 환경 변수 (`.env`)

```env
PORT=3000
MONGODB_URI=mongodb+srv://.../tourmate
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
UPLOAD_SIGNING_SECRET=...    # 운영: JWT secret과 다른 32자 이상 값
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
KAKAO_REST_API_KEY=          # Local 검색 + Mobility 길찾기 (서버 REST 키)
UPLOAD_DIR=uploads           # 입장권·문서 로컬 저장
UPLOADS_PUBLIC=false         # 운영 필수 · 서명 다운로드만 허용
# EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY 는 프론트 지도용 — 백엔드에 넣지 않음
INVITE_LINK_BASE=tripmatch://invite # 로컬 개발용. 운영은 APP_BASE_URL 기반 HTTPS 링크 자동 사용
DURI_ANDROID_PACKAGE=com.tripmatch.app
DURI_ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS=AA:BB:... # EAS/Play 서명 SHA-256, 여러 개면 쉼표 구분
DURI_IOS_APP_LINK_APP_IDS=ABCDE12345.com.tripmatch.app # Apple Team ID + bundle ID
```

운영 초대 링크는 `https://<APP_BASE_URL>/api/v1/invites/{code}`로 발급됩니다. 앱으로 바로 연결하려면 위 서명 정보를 운영 환경에 넣고 앱을 다시 빌드해야 합니다. 서버는 Android `/.well-known/assetlinks.json`과 iOS `/.well-known/apple-app-site-association`을 해당 값으로 제공합니다. 값이 없거나 잘못되면 부정확한 연결 정보를 공개하지 않고 404를 반환하며, HTTPS 초대 안내 페이지의 `두리 앱에서 열기` 버튼은 계속 사용할 수 있습니다.

### MongoDB 컬렉션 명칭

| 코드 (Schema)  | MongoDB collection |
| -------------- | ------------------ |
| User           | `users`            |
| TravelRoom     | `travel_rooms`     |
| Place          | `places`           |
| UserSave       | `user_saves`       |
| AnalysisReport | `analysis_reports` |

### Seed 데이터 (places)

앱 기동 시 `places` 컬렉션이 비어 있으면 자동 seed:

- 제주 성산일출봉
- 부산 해운대
- 경주 불국사
- 강릉 안목해변

### Swagger Example Value

DTO에 `@ApiProperty` example 추가됨 → Swagger **Try it out** 시 body 자동 채움.

### 테스트 계정 (직접 생성)

Swagger 또는 curl로 회원가입:

```json
POST /api/v1/auth/signup
{
  "nickname": "테스트",
  "email": "test@example.com",
  "password": "password123"
}
```

---

## Phase 2 / 3 백로그

| 항목                                  | Phase |
| ------------------------------------- | ----- |
| Google / Apple OAuth                  | 2     |
| guest → 정식 계정 merge               | 2     |
| Kakao Directions + 캐싱               | 2     |
| N명 그룹 궁합 알고리즘                | 2     |
| priority must/optional/skip 일정 로직 | 2     |
| LLM 기반 두리                         | 3     |
| WebSocket 실시간 협업                 | 3     |

---

## Comments

> _Notion에 옮길 때 팀 코멘트·결정 사항을 여기에 추가_

- Swagger 반영 + example 추가 완료 (`BACKEND.md` ↔ `/api/docs` 동기화)
- product 미정 항목 → [`DISCUSSION_CHECKLIST.md`](./DISCUSSION_CHECKLIST.md)
