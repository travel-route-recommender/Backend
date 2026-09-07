# Frontend API Contract

TripMatch / Tourmate NestJS 백엔드 연동용 계약 문서.  
실제 코드(`src/`) 기준이며, secret 값은 포함하지 않습니다.

| 항목 | 값 |
|------|-----|
| Base URL | `http://localhost:3000/api/v1` |
| Swagger UI | `http://localhost:3000/api/docs` |
| OpenAPI JSON | [`openapi.json`](./openapi.json) |
| Auth | `Authorization: Bearer {accessToken}` |
| Refresh | **JSON body만** (Cookie 없음) |

---

## 0. 실행 (C)

### 요구 사항

- Node.js **20+** 권장 (로컬 개발에 18+도 동작)
- MongoDB (로컬 `27017` 또는 Atlas URI)

### 설치 / 실행

```bash
cd Backend
cp .env.example .env
# .env 값 채우기 (아래 목록)
npm install
npm run start:dev
```

### 환경 변수 (이름만 — `.env.example` 참고)

| 이름 | 필수 | 기본/설명 |
|------|------|-----------|
| `PORT` | | `3000` |
| `MONGODB_URI` | ✅ | `mongodb://127.0.0.1:27017/tourmate` |
| `JWT_ACCESS_SECRET` | ✅ | access JWT 서명 |
| `JWT_REFRESH_SECRET` | ✅ | refresh JWT 서명 |
| `JWT_ACCESS_EXPIRES_IN` | | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | | `7d` |
| `KAKAO_REST_API_KEY` | | 서버 전용. Local 검색 + Mobility 길찾기. 없으면 검색은 DB seed, 길찾기는 503 |
| `EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY` | | **프론트(Expo) 전용**. 지도 SDK용. 백엔드 길찾기에 사용 불가 |
| `APP_BASE_URL` | | `http://localhost:3000` |
| `INVITE_LINK_BASE` | | `tripmatch://invite` → 링크 `{BASE}/{code}` |

### Seed

앱 기동 시 `places`가 비어 있으면 자동 seed (성산일출봉, 해운대, 불국사, 안목해변).

### 테스트 계정

별도 seed 계정 없음. 회원가입으로 생성:

```http
POST /api/v1/auth/signup
Content-Type: application/json

{
  "nickname": "테스트",
  "email": "test@example.com",
  "password": "password123"
}
```

### OpenAPI 파일 재생성

```bash
npm run openapi:generate
```

(Mongo 없이 생성. Nest 부트스트랩 export는 `npm run openapi:export` — Mongo 필요)

---

## 1. Auth 계약

공통 성공 응답 (`signup` / `login` / `refresh` / `oauth/kakao`):

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "user": {
    "id": "665abc...",
    "email": "test@example.com",
    "nickname": "윤지",
    "profileImageUrl": null,
    "travelType": null,
    "onboardingCompleted": false,
    "isGuest": false
  }
}
```

| 항목 | 실제 동작 |
|------|-----------|
| access 필드명 | `accessToken` |
| refresh 필드명 | `refreshToken` |
| 사용자 포함 | ✅ `user` (PublicUser) |
| access 만료 | `JWT_ACCESS_EXPIRES_IN` (기본 **15m**) |
| refresh 만료 | `JWT_REFRESH_EXPIRES_IN` (기본 **7d**) |
| refresh 전달 | **JSON body** `{ "refreshToken": "..." }` |
| Cookie | ❌ 사용 안 함 |
| Authorization | `Authorization: Bearer {accessToken}` |
| refresh 저장 | User.refreshTokens 최대 5개 (슬라이딩) |

### POST `/auth/signup`

```json
{
  "nickname": "윤지",
  "email": "test@example.com",
  "password": "password123",
  "termsVersion": "1.0",
  "privacyConsentVersion": "1.0",
  "overFourteenConfirmed": true
}
```

- 약관 3개 **필수**. 없으면 400 `TERMS_REQUIRED`
- 409: `Email already registered`

### POST `/auth/login`

```json
{ "email": "test@example.com", "password": "password123" }
```

- 401: `Invalid credentials`

### POST `/auth/refresh`

```json
{ "refreshToken": "..." }
```

성공: 새 `accessToken` + `refreshToken` + `user`  
실패 401: `Invalid refresh token`

프론트 권장 흐름:

1. API 401 → `POST /auth/refresh` with stored refreshToken  
2. 성공 시 두 토큰 모두 교체 저장  
3. refresh도 401이면 로그인 화면

### POST `/auth/logout` (Bearer 필요)

```json
{ "refreshToken": "..." }
```

→ `{ "success": true }` (해당 refresh만 DB에서 제거)

### POST `/auth/oauth/kakao`

```json
{
  "accessToken": "<Kakao SDK access token>",
  "termsVersion": "1.0",
  "privacyConsentVersion": "1.0",
  "overFourteenConfirmed": true
}
```

신규 가입만 약관 필수. 기존 카카오 유저는 accessToken만. 이메일 계정과 **자동 병합 안 함**.

### POST `/auth/oauth/apple`

```json
{
  "identityToken": "<Apple JWT>",
  "authorizationCode": "<code>",
  "nonce": "optional",
  "fullName": { "givenName": "지", "familyName": "윤" },
  "termsVersion": "1.0",
  "privacyConsentVersion": "1.0",
  "overFourteenConfirmed": true
}
```

- identityToken: iss/aud/exp/nonce 검증
- 신규만 약관 필수. `fullName`은 최초 1회만 옴
- 이메일 가리기·중복 이메일은 별도 계정 (자동 병합 없음)

### POST `/auth/join-by-invite` (비인증)

```json
{
  "inviteCode": "ABCD1234",
  "nickname": "게스트윤지",
  "termsVersion": "1.0",
  "privacyConsentVersion": "1.0",
  "overFourteenConfirmed": true
}
```

성공:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "nickname": "게스트윤지", "isGuest": true, "email": null, ... },
  "roomId": "665..."
}
```

- guest도 refresh 가능 (동일 토큰 발급 로직)
- 잘못된 코드: 401 `Invalid invite code`

### Bearer 불필요

`/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/join-by-invite`, `/auth/oauth/kakao`, `/auth/oauth/apple`  
`/quiz/questions`, `/places/*`, `/destinations/*`

### DELETE `/users/me` (Bearer)

- 이메일 계정: `{ "password": "..." }` 필수
- 게스트·카카오·애플: body 없이 가능
- 일정은 남기고 닉네임 `탈퇴한 사용자`
- 본인이 올린 티켓/문서 사진은 삭제
- 방장인 방은 `status: closed` (쓰기 불가)
- 이후 그 유저 JWT는 401

---

## 2. 공통 오류 응답

Nest 기본 + `HttpException` 형태. **커스텀 `code` 필드는 없음.**

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password must be longer than or equal to 6 characters"],
  "error": "Bad Request"
}
```

또는 단일 문자열:

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

| HTTP | 대표 상황 |
|------|-----------|
| 400 | ValidationPipe (`whitelist` + `forbidNonWhitelisted`) |
| 401 | JWT 없음/만료, 로그인 실패, refresh 실패 |
| 403 | room 비멤버, invite 재발급 owner 아님 |
| 404 | room / place / schedule item 없음 |
| 409 | 이메일 중복 |
| 429 | **미구현** (외부 API rate limit 전용 응답 없음) |
| 500 | 미처리 예외 |

요청한 `{ statusCode, code, message, details }` 포맷은 **현재 미적용**. 필요하면 백엔드에서 filter 추가 가능.

---

## 3. Users

PublicUser (로그인·멤버 노출용 요약):

```ts
{
  id: string;
  email?: string | null;
  nickname: string;
  profileImageUrl?: string | null;
  travelType?: { name, description, tags[], warning, emoji } | null;
  onboardingCompleted: boolean;
  isGuest: boolean;
}
```

FullUser (`GET /users/me` — 본인 전체, 비밀 필드 제외):

```ts
PublicUser & {
  oauthProvider?: string | null;
  quizPreferences?: Record<string, unknown> | null;
  personalityAxes?: {
    scheduleDensity: number;
    landmarkNecessity: number;
    localInterest: number;
    challenging: number;
  } | null;
  hasLicense?: boolean | null;
  hasCar?: boolean | null;
  mobilityConstraints: string[];  // STAIRS | STEEP_SLOPE | LONG_WALK
  birthYear?: number | null;
  interestTags: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
}
```

**제외:** `passwordHash`, `refreshTokens`  
**퀴즈 원본 응답:** User에 없음 → `GET /quiz/me` / 세션 API

### GET `/users` (회원가입한 유저 목록)

**인증 불필요.** PublicUser 배열 (passwordHash/refreshTokens 제외).

| Query | 기본 | 설명 |
|-------|------|------|
| `page` | 1 | |
| `limit` | 50 | 최대 100 |
| `q` | | nickname / email 부분 검색 |
| `includeGuests` | false | `true`면 게스트 포함 |

```json
{
  "data": [
    {
      "id": "...",
      "email": "a@example.com",
      "nickname": "윤지",
      "profileImageUrl": null,
      "travelType": { "name": "...", "tags": [] },
      "onboardingCompleted": true,
      "isGuest": false
    }
  ],
  "meta": { "total": 42, "page": 1, "limit": 50 }
}
```

### GET `/users/me`

```json
{
  "id": "...",
  "email": "...",
  "nickname": "...",
  "profileImageUrl": null,
  "travelType": { "name": "...", "tags": [] },
  "onboardingCompleted": true,
  "isGuest": false,
  "oauthProvider": null,
  "quizPreferences": { "...": "..." },
  "personalityAxes": {
    "scheduleDensity": 72,
    "landmarkNecessity": 55,
    "localInterest": 40,
    "challenging": 80
  },
  "hasLicense": true,
  "hasCar": false,
  "mobilityConstraints": [],
  "birthYear": 1999,
  "interestTags": ["카페", "자연"],
  "createdAt": "...",
  "updatedAt": "...",
  "stats": { "ongoingTrips": 1, "completedTrips": 0 }
}
```

### GET `/users/me/travel-type` → TravelType 객체 또는 `null`

### GET `/users/me/trips-summary` → `{ "ongoing": 1, "completed": 0 }`

### PATCH `/users/me/profile`

수정 가능: **`nickname`**, **`profileImageUrl`** 만.

### PATCH `/users/me/onboarding-complete` → body 없음, `onboardingCompleted: true`

---

## 4. Quiz (두리 성향 테스트)

신규 플로우: **세션 생성 → 중간 저장 → 완료 → 성향 조회**

**점수 계산은 FE.** 서버는 원본+환산값을 검증·저장하고, 여행방 공유용 4축(`axes`)·TravelType을 매핑합니다.

| 챕터 | id | 내용 |
|------|-----|------|
| 도전·일정·활동 | `challengeStyle` | 6문항 + 활동9문항 원본, type, scores, scheduleStyle, itineraryPreference |
| 숙소 | `accommodation` | answers 1–8 + scores 0–100 |
| 체력 | `stamina` | answer / level / score |
| 예산 | `budget` | ranking만 (코인 분배 없음) |
| 명소·로컬 | `discovery` | answers 1–4 + scores 0–100 |

도전 유형: `challenge_executor` | `cautious_explorer` | `stable_planner`  
일정 유형: `packed` | `relaxed`  
예산 ranking 5개(중복 없이): `stay` `food` `activity` `shopping` `mobility`

### GET `/quiz/steps` (비인증)

`challengeStyle` / `accommodation` / `stamina` / `budget` / `discovery`

### GET `/quiz/tags` (비인증)

`budgetRankItems` + 참고용 mock tags. 코인 분배는 쓰지 않음.

### POST `/quiz/sessions` (인증)

새 `in_progress` 세션. `totalSteps: 5`

### PATCH `/quiz/sessions/:sessionId` (인증)

챕터 partial merge.

### POST `/quiz/sessions/:sessionId/complete` (인증)

`responses` **필수** (전체 챕터).

```json
{
  "responses": {
    "surveyVersion": 9,
    "algorithmVersion": 9,
    "challengeStyle": {
      "challengeStyleAnswers": { "i18": 4, "i48": 2 },
      "itineraryMessageAnswers": { "restaurant": "like", "density": "like" },
      "type": "cautious_explorer",
      "scores": {
        "opennessToVariety": 75,
        "excitementSeeking": 88,
        "cautiousness": 63,
        "exploration": 81
      },
      "scheduleStyle": {
        "type": "packed",
        "score": 75,
        "components": { "density": 100, "activeRestPreference": 50, "stamina": 50 }
      },
      "itineraryPreference": {
        "categoryScores": {
          "restaurant": 100, "cafe": 50, "shopping": 0, "attraction": 100,
          "local": 100, "experience": 50, "nature": 100, "rest": 50
        },
        "densityScore": 100
      }
    },
    "accommodation": {
      "answers": { "stayMeaning": 6, "locationFacility": 4, "comfortPrice": 3 },
      "scores": { "stayImportance": 71, "facilityOverLocation": 43, "comfortOverPrice": 71 }
    },
    "stamina": { "answer": "medium", "level": "NORMAL", "score": 50 },
    "budget": { "ranking": ["food", "stay", "activity", "shopping", "mobility"] },
    "discovery": {
      "answers": { "landmarkImportance": 3, "localInterest": 4 },
      "scores": { "landmarkImportance": 67, "localInterest": 100 }
    }
  }
}
```

서버 매핑:
- `axes.scheduleDensity` ← scheduleStyle.score
- `axes.landmarkNecessity` ← discovery.scores.landmarkImportance
- `axes.localInterest` ← discovery.scores.localInterest
- `axes.challenging` ← challenge scores 평균
- `travelType` ← challengeStyle.type

### GET `/quiz/me` (인증)

최신 완료 성향 + 원본 `responses`.

### POST `/quiz/submit` (레거시, deprecated)

---

## 5. Rooms

### status enum

`ongoing` | `completed`

### CreateRoomDto — POST `/rooms`

```json
{ "title": "제주 여행" }
```

`title`만 optional (기본 `"새 여행방"`).

**자동 설정:** `createdBy`=본인, role=`owner`, `inviteCode`/`inviteLink` 생성, status=`ongoing`

**저장하지 않는 프론트 필드:** 예산, 이동수단, 일정 밀도, 여행 목적, destinationId, memberIds, start/end (생성 시)

날짜/여행지는 이후:

- `PATCH /rooms/:id` → title, startDate, endDate, status  
- `PATCH /rooms/:id/destination` → `{ name, regionCode?, lat?, lng? }`

### Room 응답 (`formatRoom`)

```json
{
  "id": "...",
  "title": "제주 여행",
  "destination": { "name": "제주", "regionCode": "JEJU", "lat": 33.5, "lng": 126.5 },
  "startDate": "2026-07-10T00:00:00.000Z",
  "endDate": "2026-07-13T00:00:00.000Z",
  "status": "ongoing",
  "createdBy": "...",
  "members": [
    {
      "userId": "...",
      "role": "owner",
      "joinedAt": "...",
      "travelTypeSnapshot": { "name": "...", "tags": [] }
    }
  ],
  "inviteCode": "ABCD1234",
  "inviteLink": "tripmatch://invite/ABCD1234",
  "progress": { "label": "시작 전", "currentStep": 0, "percent": 0 },
  "scheduleStyle": null,
  "selectedCourseId": null,
  "candidateCount": 0,
  "scheduleItemCount": 0,
  "scheduleVersion": 0
}
```

### GET `/rooms/me?status=ongoing`

카드용 요약 배열:

```json
{
  "id": "...",
  "title": "제주 여행",
  "destination": "제주",
  "status": "ongoing",
  "progressLabel": "일정 짜는 중",
  "lastUpdated": "2026-07-14T12:00:00.000Z",
  "summary": "제주 여행 계획",
  "currentStep": 3,
  "startDate": "2026-07-25T00:00:00.000Z",
  "endDate": "2026-07-26T00:00:00.000Z",
  "memberCount": 3,
  "durationDays": 2,
  "candidateCount": 5
}
```

### 일정 저장 동시성

- `GET /rooms/:id/schedule` → `{ days, scheduleVersion }`
- `PUT /rooms/:id/schedule` body에 `expectedVersion` **필수**
- 단일 item 추가/수정/삭제/reorder/tickets도 `expectedVersion` **필수**
- version mismatch 시 **409 Conflict** (`currentVersion` 포함)
- reorder는 해당 day의 **모든 item id exact permutation** 필수
- `UpdateScheduleItemDto`에 `reason` 포함
- `startTime`/`endTime`은 `HH:mm`, start < end, `day`는 여행 기간 내

### POST `/rooms/from-compatibility`

```json
{ "memberUserIds": ["userId2"], "title": "궁합 여행" }
```

---

## 6. Destinations

### 현재 API

- `GET /destinations/popular` — places `popularityScore` Top 10

### 없는 API

- `GET /destinations`
- `GET /destinations?keyword=`
- destination detail / **destinationId 개념 없음**

여행방 지역은 **문자열 destination**으로 설정:

```json
PATCH /rooms/:roomId/destination
{ "name": "부산", "regionCode": "BUSAN", "lat": 35.18, "lng": 129.08 }
```

프론트 고정 목록 예시 (ID 없이 name 사용):

| name | regionCode | lat | lng |
|------|------------|-----|-----|
| 제주 | JEJU | 33.4996 | 126.5312 |
| 부산 | BUSAN | 35.1796 | 129.0756 |
| 강릉 | GANGNEUNG | 37.7519 | 128.8761 |
| 경주 | GYEONGJU | 35.8562 | 129.2247 |
| 서울 | SEOUL | 37.5665 | 126.9780 |

---

## 7. Places (공통 CommonPlace)

TourAPI(`/tour/places/*`)와 Kakao/DB(`/places/*`), 후보·저장의 `place` 필드는 **같은 CommonPlace** 형식을 씁니다.

```ts
type CommonPlace = {
  id: string;                 // placeId ?? `${source}:${externalId}`
  placeId: string | null;     // Mongo _id (Tour 목록은 상세 전 null)
  externalId: string;         // Tour contentId | Kakao id
  source: 'tour' | 'kakao' | 'manual';
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  thumbnailUrl: string | null;
  images: string[];           // URL만
  category: string | null;
  contentTypeId: number | null;
  contentTypeLabel: string | null;
  tags: string[];
  phone: string | null;
  placeUrl: string | null;
  description: string | null;
  distanceMeters?: number;    // nearby 등
};
```

### FE 사용 규칙

| 하고 싶은 일 | 필드 |
|--------------|------|
| 리스트 key | `id` |
| 후보/저장 추가 | `placeId` (있으면) |
| Tour 목록에서 후보 추가 (placeId null) | `{ tourContentId: externalId, contentTypeId? }` |
| 지도 좌표 | `lat` / `lng` (**latitude/longitude 아님**) |
| 썸네일 | `thumbnailUrl` 또는 `images[0]` |

### Breaking (구 필드 → 신 필드)

| 구 (Tour) | 신 (CommonPlace) |
|-----------|------------------|
| `id` = contentId | `externalId` = contentId, `id` = client key |
| `source: 'TOUR_API'` | `source: 'tour'` |
| `latitude` / `longitude` | `lat` / `lng` |
| `tel` / `homepage` | `phone` / `placeUrl` |
| detail `images[{url}]` | `images: string[]` + `gallery` (메타) |
| Kakao `_id` | `placeId` (= `id`) |

### GET `/places/search`

| Query | 설명 |
|-------|------|
| `q` | 검색어 |
| `category` | 로컬 DB 필터 (Kakao 경로에서는 미사용) |
| `lat` / `lng` | number (Kakao `y`/`x`로 전달) |
| `page` | 기본 1 |
| `limit` | 기본 20 |
| radius | **미지원** |

응답: `{ data: CommonPlace[], meta: { total, page, limit } }`

### 데이터 소스

- **TourAPI** → `/tour/places/*` (메인 관광 탐색). 상세 시 Mongo upsert → `placeId` 부여  
- **Kakao Local** → `/places/search` (카페·상점 보조). upsert 후 항상 `placeId` 있음  
- 실패/무키 → 로컬 Mongo `places`  

### Batch

`POST /places/batch` **없음**.

대안:

- saves / candidates / workspace 응답에 **CommonPlace** 포함
- schedule item은 placeId + placeName만 (Place 미포함)
- 필요 시 `GET /places/:id` N회 또는 batch 추가 요청

---

## 8. User Saves

| Method | Path | 비고 |
|--------|------|------|
| GET | `/users/me/saves` | `{ id, savedAt, place }` — Place 포함 |
| POST | `/users/me/saves` | `{ placeId, roomId? }` upsert |
| DELETE | `/users/me/saves/:placeId` | `roomId: null` 개인 저장만 삭제 |

- 개인 Save ≠ room Candidate (분리 유지)  
- `roomId`는 컨텍스트 태깅용 (후보 API 아님)  
- 중복 저장: upsert (에러 없음)  
- 없는 삭제: 그래도 `{ success: true }`

---

## 9. Candidates

응답 항목:

```json
{
  "placeId": "...",
  "addedBy": "...",
  "addedAt": "...",
  "note": "꼭 가고 싶어요",
  "scheduled": false,
  "place": { /* CommonPlace */ }
}
```

- 별도 candidate `_id` 없음 (room embed)  
- POST `{ placeId, note? }` **또는** `{ tourContentId, contentTypeId?, note? }` — 동일 user+place 중복 시 no-op 후 목록 반환  
- DELETE 본인 `addedBy`만 제거. 타인 후보는 매칭 안 되어 **조용히 무시** (`{ success: true }` — 403 아님)

### `scheduled` 일관성

- DB 필드이지만, 일정 add/delete/PUT 시 **schedule의 placeId로부터 재동기화**함  
- 일정에 넣으면 `true`, 일정에서 빠지면 `false`

---

## 10. Schedule

### 모델 (프론트 durationMinutes / itemType / date 와 다름)

```json
{
  "id": "item-1",
  "placeId": "optional-mongo-id",
  "placeName": "성산일출봉",
  "startTime": "09:00",
  "endTime": "11:00",
  "tags": ["자연"],
  "reason": "",
  "priority": "must",
  "day": 1,
  "lat": 33.458,
  "lng": 126.942
}
```

| 프론트 필드 | 백엔드 |
|-------------|--------|
| `date` YYYY-MM-DD | **`day` number** (1, 2, …) |
| `durationMinutes` | `startTime`/`endTime`으로 표현 |
| `itemType` meal/rest | **없음** — `placeName`만 필수, placeId optional |
| `note` | `reason` |
| `priority` | `must` \| `optional` \| `skip` |

- `startTime` / `endTime` **둘 다 필수** (HH:mm 문자열)  
- `24:00` / 자정 넘김: **검증 없음** (클라이언트가 알아서)  
- Place 객체: schedule 응답에 **미포함**

### API 매핑 (프론트 동작)

| 동작 | API |
|------|-----|
| 같은 날 순서 변경 | `PATCH .../schedule/reorder` `{ day, itemIds, expectedVersion }` |
| 다른 날로 이동 | `PATCH .../schedule/items/:itemId` `{ day\|date, expectedVersion, unlock? }` |
| 시작/종료 시간 변경 | `PATCH .../schedule/items/:itemId` `{ startTime, endTime, expectedVersion }` |
| 항목 추가 | `POST .../schedule/items` `{ ..., expectedVersion }` |
| 전체 교체 | `PUT .../schedule` `{ days, expectedVersion }` **필수** |
| 잠금 | `PATCH .../schedule/items/:itemId/lock` `{ locked, expectedVersion }` |
| 확정 예약 | `PUT .../schedule/items/:itemId/reservation` |
| 입장권 업로드 | `POST .../tickets` multipart `image` + `expectedVersion` |
| 계획 설정 | `GET/PATCH .../planning` (숙소·복귀·timezone·이동수단·버퍼) |
| 여행 날짜 원자 변경 | `PATCH .../trip-dates` `{ startDate, endDate, expectedVersion, itemActions? }` |
| 제안 적용 | `POST .../schedule/apply` `{ days, expectedVersion, expectedFactsVersion? }` |
| 분석 기준 | `GET .../analysis-baseline` |
| 성향 공유 | `GET .../preferences` (파생값만, null≠0) |
| 이동제약 새로고침 | `POST .../preferences/refresh-constraints` |
| 후보 선호 신호 | `PUT .../candidates/:placeId/signals` |
| 공유 TODO | `GET/POST .../todos`, `PATCH/DELETE .../todos/:todoId`, `POST .../todos/resolve-auto` |
| 공유 문서 | `GET/POST .../documents`, `DELETE .../documents/:documentId` |
| 서명 다운로드 | `POST .../files/signed-url` → `GET /files/download?token=` |

### 역할
- **방장만:** 방 수정·여행지·여행 날짜·planning·초대코드 재발급
- **멤버:** 일정/후보/TODO/문서/티켓 (TODO 수정·삭제는 작성자·담당자·방장)

### 버전·충돌 (P0)

- 모든 일정/티켓 변경에 **`expectedVersion` 필수**
- 서버는 `findOneAndUpdate({ scheduleVersion })` 조건부 커밋
- 충돌 시 `409` `{ code: "SCHEDULE_VERSION_CONFLICT", currentVersion, expectedVersion }`
- 파일 삭제는 **커밋 성공 후**만 실행 (충돌 시 기존 파일 유지)
- `clientMutationId` 재전송 시 동일 결과·버전 유지 (idempotent)
- 잠긴 항목: 이동/리사이즈/삭제/장소교체 거부. `unlock=true` 또는 lock API로 해제
- `placeId` 변경 시 **티켓·예약 비승계** (이전 티켓 파일은 커밋 후 삭제)
- 같은 day 시간 겹침 → `400 SCHEDULE_OVERLAP`
- `date`(YYYY-MM-DD)가 있으면 day는 서버가 `startDate`에서 파생

### 입장권 (사용자 업로드 사진)

```http
POST /rooms/:roomId/schedule/items/:itemId/tickets
Content-Type: multipart/form-data
Authorization: Bearer …

image: <file>            # jpeg/png/webp/heic, ≤5MB
expectedVersion: 3       # 필수
note: 사전 예매 QR         # optional
clientMutationId: ...    # optional
```

- 이미지 표시: `{APP_BASE_URL}{imageUrl}`
- 항목당 최대 10장
- `placeId`가 바뀌면 기존 tickets는 **승계되지 않음**
- DELETE도 `?expectedVersion=` 필수

### PUT `/rooms/:id/schedule` (batch)

- **전체 replace** + **expectedVersion 필수** + 조건부 쓰기  
- Validation 실패·버전 충돌 시 저장 안 함 (파일 부수효과 없음)  
- `id` 없으면 서버가 생성  
- 요청에 없는 item = 삭제 (잠긴 item 삭제는 거부)  
- 같은 item id + 같은 placeId면 tickets/reservation 유지; placeId 변경 시 티켓 비승계  

### reorder

```json
{ "day": 1, "itemIds": ["item-3", "item-1", "item-2"], "expectedVersion": 3 }
```

같은 day 순서만. 시간 변경/날짜 이동 불가.

---

## 11. Mobility (자동차 길찾기 BFF)

프론트는 **지도 표시만** `EXPO_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY`(JS 키)를 쓰고,  
**경로·이동시간**은 아래 백엔드 API만 호출합니다. JS 키로는 서버 길찾기가 불가합니다.

### POST `/mobility/directions` (Bearer 필요)

```json
{
  "origin": { "lat": 37.5665, "lng": 126.978 },
  "destination": { "lat": 37.5700, "lng": 126.982 },
  "waypoints": [],
  "priority": "RECOMMEND",
  "summaryOnly": true
}
```

응답:

```json
{
  "distanceMeters": 4520,
  "durationSeconds": 780,
  "fare": { "taxi": 12000, "toll": 0 },
  "source": "kakao-mobility"
}
```

| 포함 | 미포함 |
|------|--------|
| 자동차 경로 거리·시간 (Kakao Mobility) | 대중교통 / **막차시간** (실데이터) |
| 선택적 path 좌표 (`summaryOnly: false`) | 예약 조회 (외부 OTA) |

### POST `/mobility/transit` (stub)

```json
{ "available": false, "reason": "TRANSIT_PROVIDER_NOT_CONFIGURED", "legs": [], "lastDepartureAt": null }
```

프로바이더/키 정해지면 채움. 지금은 FE가 `available:false`로 분기하면 됨.

### Notifications (stub)

- `GET /notifications` → `{ available: false, items: [], unreadCount: 0 }`
- `POST /notifications/ack` → 저장 없음

입장권 사진은 Mobility가 아니라 **일정 항목 tickets API**로 관리합니다 (`POST/GET/DELETE .../schedule/items/:itemId/tickets`).

두리 분석 리포트(`POST /rooms/:id/duri/analysis-report`)의 `routeAnalysis`도 같은 Mobility를 사용해 segment별 `distanceMeters` / `durationSeconds`를 채웁니다. 좌표가 없거나 키가 없으면 해당 segment는 `status: "unknown"`.

---

## 11b. Shared TODO

```http
GET    /rooms/:roomId/todos
POST   /rooms/:roomId/todos
PATCH  /rooms/:roomId/todos/:todoId   # expectedRevision 필수
DELETE /rooms/:roomId/todos/:todoId?expectedRevision=
POST   /rooms/:roomId/todos/resolve-auto
```

- 담당자(`assigneeId`)는 **현재 방 멤버만**
- revision 충돌 → `409` + 최신 todo
- 자동 TODO 삭제 = `archived` + `suppressed` (동일 원인 재생성 방지)
- 일정 항목 삭제 시 연결 TODO는 detach (`todoLinkImpact`)
- **자동 생성:** must 일정 추가 → 예약/입장권 TODO · 예약 미확정 → `ocrConfirm` · 티켓 업로드 시 missing-ticket resolve

### 문서 · 서명 URL

```http
GET/POST /rooms/:roomId/documents
DELETE   /rooms/:roomId/documents/:documentId
POST     /rooms/:roomId/files/signed-url   { "path": "/uploads/tickets/..."}
GET      /files/download?token=...         # Public (토큰만)
```

- 티켓/문서 응답에 `download: { url, expiresAt, ... }` 포함
- `UPLOADS_PUBLIC=false`면 정적 `/uploads` 끄고 서명 URL만 사용
- Tour 상세 `operatingHours`: `{ status, hoursText, restDateText, weekdayRanges, raw, fetchedAt }`

### PATCH `/rooms/:id/trip-dates`

날짜 변경 + 일정 move/delete를 **한 `scheduleVersion` 조건부 커밋**으로 저장.

```json
{
  "startDate": "2026-07-10",
  "endDate": "2026-07-14",
  "expectedVersion": 3,
  "itemActions": [
    { "itemId": "item-1", "action": "move", "day": 2 },
    { "itemId": "item-2", "action": "delete", "unlock": true }
  ]
}
```

기간 밖 day는 `ITEM_OUT_OF_RANGE` — `itemActions`로 move/delete 필수.

### POST `/rooms/:id/schedule/apply`

batch `PUT /schedule`와 동일 잠금·예약 규칙 + optional `expectedFactsVersion` (불일치 시 `FACTS_VERSION_CONFLICT`).

### GET `/rooms/:id/preferences`

- axes 파생값 + unit/range/source/method
- 미응답 → `null` (0 채우지 않음)
- `mobilityConstraints.status`: `present` | `missing` | `stale`
- `candidateSignals[].preferenceStrength` 미응답 = `null`

---

## 12. Compatibility (궁합)

- `GET .../compatibility` ≡ `GET .../match-result`  
- 멤버 `travelTypeSnapshot.tags` 교집합 점수  
- **실질 2인 로직** (`calculateMatchResult`가 앞 2명만 사용)  
- 2명 미만: score 0 + “동행자 정보가 부족합니다.”  
- 3명+: 앞 2명만 — **그룹 진단은 프론트 로컬 유지 권장**  
- `adjustment-plan` / `courses`: **static template / rule stub**

---

## 13. Duri (대부분 stub · 분석 리포트 경로만 Mobility 연동)

| Endpoint | 구현 수준 | 자동 적용 가능? |
|----------|-----------|-----------------|
| suggest-places | stub 문구 | ❌ |
| suggest-order | heuristic (reverse itemIds) | 수동 적용 |
| fill-gaps | stub | ❌ |
| replace-place | stub | ❌ |
| reflect-preferences | compatibility 재사용 | ❌ |
| optimize | stub message | ❌ |
| generate-draft | stub days | 클라이언트가 PUT schedule |
| analysis-report | Mobility로 segment 거리·시간 채움 (좌표 없으면 unknown) | 참고용 |
| analysis-report/latest | DB 조회 | 참고용 |

응답에 before/after schedule diff 구조 **없음**. 자동 적용은 연결하지 말고 참고용으로 쓰는 것이 맞음.

---

## 14. Invite

| API | 비고 |
|-----|------|
| GET `/invites/:code/preview` | **비인증** 미리보기 (여행지·기간·멤버수·방장) |
| GET `/rooms/:id/invite-link` | `{ inviteCode, inviteLink }` |
| POST `/rooms/:id/invites` | owner만, 코드 **즉시 교체** (만료 필드 없음) |
| POST `/invites/:code/accept` | 기존 유저 + Bearer |
| POST `/auth/join-by-invite` | guest 생성 + tokens + roomId |

### GET `/invites/:code/preview` (비인증)

```json
{
  "inviteCode": "ABCD1234",
  "title": "부산 여행",
  "destination": "부산",
  "startDate": "2026-07-25T00:00:00.000Z",
  "endDate": "2026-07-26T00:00:00.000Z",
  "durationDays": 2,
  "memberCount": 3,
  "ownerNickname": "수민",
  "status": "ongoing",
  "previewText": {
    "headline": "부산 1박 2일 여행에 초대받았어요",
    "destination": "부산",
    "period": "7월 25일 ~ 7월 26일",
    "memberCount": 3,
    "ownerNickname": "수민"
  }
}
```

기본 링크: `tripmatch://invite/{code}`  
웹 URL은 `INVITE_LINK_BASE`를 `https://app.example.com/invite`처럼 바꾸거나, 프론트에서 code만 파싱.

---

## 15. Onboarding

가입 직후 사전 정보 (퀴즈와 별개):

- `GET /onboarding/status`
- `GET|POST /onboarding/survey`

### POST `/onboarding/survey` body

```json
{
  "hasLicense": true,
  "hasCar": false,
  "mobilityConstraints": ["STAIRS", "LONG_WALK"],
  "birthYear": 2003,
  "age": 23,
  "tags": ["카페", "바다", "맛집"],
  "answers": { "preferredCompanion": "friends" }
}
```

| 필드 | 설명 |
|------|------|
| hasLicense / hasCar | 면허·자차 |
| mobilityConstraints | `STAIRS` \| `STEEP_SLOPE` \| `LONG_WALK` 만 (민감정보 최소화) |
| birthYear / age | 체력 보정용 |
| tags | 관심 태그 |
| answers | 기타 자유 형식 (optional) |

User에도 `hasLicense`, `hasCar`, `mobilityConstraints`, `birthYear`, `interestTags` 캐시. 제출 시 `onboardingCompleted: true`.

---

## 16. 프론트 연동 우선순위 체크리스트

1. ✅ Auth 토큰 계약 (body refresh, Bearer access)  
2. ✅ Users / Quiz DTO (세션 플로우)  
3. ✅ CreateRoomDto + Room 응답  
4. ✅ Schedule item / reorder / PUT batch  
5. ✅ Places search + source 한계  
6. ⚠️ Destinations 목록 API 없음 → 고정 name 목록 또는 destination PATCH  
7. ⚠️ Places batch 없음  
8. ⚠️ Duri는 stub — 자동 적용 비권장  
9. ⚠️ KTO OpenAPI 미연동  
10. ✅ 성향 테스트: 일정표 feature + 4축 유형 + preference 분리  

질문/추가 구현이 필요하면 Backend 쪽에서 `POST /places/batch`, `GET /destinations`, 오류 `code` 필드 등을 이어서 맞출 수 있습니다.
