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
| `KAKAO_REST_API_KEY` | | 없으면 장소 검색은 DB seed/로컬만 |
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
{ "nickname": "윤지", "email": "test@example.com", "password": "password123" }
```

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
{ "accessToken": "<Kakao SDK access token>" }
```

프론트가 보내는 것은 **카카오 access token** (우리 JWT 아님).

### POST `/auth/join-by-invite` (비인증)

```json
{ "inviteCode": "ABCD1234", "nickname": "게스트윤지" }
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

`/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/join-by-invite`, `/auth/oauth/kakao`  
`/quiz/questions`, `/places/*`, `/destinations/*`

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

PublicUser:

```ts
{
  id: string;
  email?: string | null;
  nickname: string;
  profileImageUrl?: string;
  travelType?: { name, description, tags[], warning, emoji } | null;
  onboardingCompleted: boolean;
  isGuest: boolean;
}
```

**`quizAnswers`는 User 응답에 없음.** (별도 `test_results` collection)

### GET `/users/me`

```json
{
  "id": "...",
  "email": "...",
  "nickname": "...",
  "profileImageUrl": null,
  "travelType": null,
  "onboardingCompleted": false,
  "isGuest": false,
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

유형(TravelType)은 아래 **4축** rule-based로 산출합니다.

| 축 | 설명 | 측정 |
|----|------|------|
| scheduleDensity | 일정 밀도 | 일정표 feature |
| landmarkNecessity | 명소 필수도 | 일정표 place feature |
| localInterest | 로컬 관심도 | 일정표 place feature |
| challenging | 도전·안정 | LESS_VALIDATED / VALIDATED (+ 0–100) |

이동·숙소·예산·체력은 **유형이 아닌 preference**로 저장합니다.

### GET `/quiz/steps` (비인증)

테스트 스텝 메타 (schedule / transport / accommodation / validation / stamina / spending)

### GET `/quiz/questions` (비인증)

스텝을 문항 형태로도 노출 (안내용). 실제 응답은 sessions API 사용.

### GET `/quiz/tags` (비인증)

예산 코인 분배용 카테고리·태그. 실데이터 없으면 `source: "mock"`.

```json
{
  "source": "mock",
  "categories": ["ACCOMMODATION", "FOOD", "TRANSPORT", "TOURISM", "ACTIVITY", "SHOPPING", "CAFE_REST"],
  "tags": [
    {
      "id": "tag-food",
      "category": "FOOD",
      "label": "음식",
      "examples": ["맛집", "로컬식당", "해산물"]
    }
  ]
}
```

### POST `/quiz/sessions` (인증)

새 `in_progress` 세션 생성. 이전 `isLatest` 해제.

```json
{
  "id": "...",
  "status": "in_progress",
  "responses": {},
  "answeredCount": 0,
  "totalSteps": 6,
  "travelType": null,
  "axes": null,
  "preferences": null,
  "completedAt": null
}
```

### PATCH `/quiz/sessions/:sessionId` (인증)

응답 **중간 저장** (merge).

```json
{
  "responses": {
    "scheduleDraft": [
      {
        "startMinutes": 540,
        "endMinutes": 660,
        "kind": "PLACE",
        "placeName": "성산일출봉",
        "landmarkScore": 90,
        "localScore": 20
      },
      {
        "startMinutes": 660,
        "endMinutes": 720,
        "kind": "REST"
      }
    ],
    "transportPreferences": {
      "CAR": 20,
      "PUBLIC_TRANSIT": 90,
      "WALKING": 60,
      "TAXI": 30
    },
    "accommodationPreference": {
      "stayImportance": 30,
      "facilityOverLocation": 40,
      "comfortOverPrice": 65
    },
    "placeValidationPreference": "LESS_VALIDATED",
    "challenging": 80,
    "staminaLevel": "NORMAL",
    "spendingAllocation": {
      "totalCoins": 100,
      "allocation": {
        "ACCOMMODATION": 20,
        "FOOD": 30,
        "TRANSPORT": 10,
        "TOURISM": 10,
        "ACTIVITY": 20,
        "SHOPPING": 5,
        "CAFE_REST": 5
      }
    }
  }
}
```

- `scheduleDraft`만 보내도 서버가 `scheduleFeatures` / `placeFeatures`를 추출합니다.
- 프론트가 이미 feature를 계산했다면 `scheduleFeatures` / `placeFeatures`를 직접 넣어도 됩니다.

### POST `/quiz/sessions/:sessionId/complete` (인증)

완료 + 진단. body의 `responses`는 optional (마지막 merge).

성공:

```json
{
  "sessionId": "...",
  "travelType": {
    "name": "도전적인 탐험가",
    "description": "...",
    "tags": ["숨은명소", "액티비티", "로컬", "도전"],
    "warning": "...",
    "emoji": "🔥"
  },
  "axes": {
    "scheduleDensity": 72,
    "landmarkNecessity": 66,
    "localInterest": 34,
    "challenging": 80
  },
  "preferences": {
    "transportPreferences": { "...": "..." },
    "accommodationPreference": { "...": "..." },
    "placeValidationPreference": "LESS_VALIDATED",
    "challenging": 80,
    "staminaLevel": "NORMAL",
    "spendingAllocation": { "...": "..." },
    "scheduleFeatures": { "...": "..." },
    "placeFeatures": { "...": "..." }
  },
  "stamina": { "staminaLevel": "NORMAL", "staminaScore": 55 },
  "user": { "...": "PublicUser" }
}
```

- User.travelType / quizPreferences / personalityAxes 캐시 갱신
- `test_results`에 이력 저장, 재응시 가능

### GET `/quiz/me` (인증)

최신 완료 성향 조회.

### GET `/quiz/status` (인증)

```json
{
  "completed": true,
  "onboardingCompleted": true,
  "sessionId": "...",
  "status": "completed",
  "answeredCount": 6,
  "totalQuestions": 6,
  "totalSteps": 6
}
```

### POST `/quiz/submit` (레거시, deprecated)

구 8문항 한 방 제출. 신규는 sessions 플로우 사용.

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
- `PUT /rooms/:id/schedule` body에 `expectedVersion` 포함 권장
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

## 7. Places

### GET `/places/search`

| Query | 설명 |
|-------|------|
| `q` | 검색어 |
| `category` | 로컬 DB 필터 (Kakao 경로에서는 미사용) |
| `lat` / `lng` | number (Kakao `y`/`x`로 전달) |
| `page` | 기본 1 |
| `limit` | 기본 20 |
| radius | **미지원** |

응답:

```json
{
  "data": [ /* Place documents */ ],
  "meta": { "total": 40, "page": 1, "limit": 20 }
}
```

### Place 필드

| 필드 | 타입 | 비고 |
|------|------|------|
| `_id` | string (ObjectId) | placeId |
| `name` | string | |
| `address` | string | |
| `lat` / `lng` | **number** | string 아님 |
| `category` | string? | |
| `tags` | string[] | |
| `images` | string[] | thumbnail 단일 필드 없음 → `images[0]` |
| `description` | string | |
| `source` | `kakao` \| `manual` | **`kto` 없음** |
| `externalId` | string? | Kakao place id |
| `phone` | string? | |
| `placeUrl` | string? | homepage 역할 |
| rating | — | **없음** |

### 데이터 소스

- **Kakao Local** (`KAKAO_REST_API_KEY` 있을 때) → DB upsert  
- 실패/무키 → 로컬 Mongo `places`  
- **한국관광공사(KTO) OpenAPI: 미연동**

### Batch

`POST /places/batch` **없음**.

대안:

- saves / candidates / workspace 응답에 **Place 객체 포함**
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
  "place": { /* Place */ }
}
```

- 별도 candidate `_id` 없음 (room embed)  
- POST `{ placeId, note? }` — 동일 user+place 중복 시 no-op 후 목록 반환  
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
| 같은 날 순서 변경 | `PATCH .../schedule/reorder` `{ day, itemIds }` |
| 다른 날로 이동 | `PATCH .../schedule/items/:itemId` `{ day }` |
| 시작/종료 시간 변경 | `PATCH .../schedule/items/:itemId` `{ startTime, endTime }` |
| 항목 추가 | `POST .../schedule/items` |
| 전체 교체 (두리 적용) | `PUT .../schedule` `{ days: [...] }` |

### PUT `/rooms/:id/schedule` (batch)

- **전체 replace** (해당 room.schedule.days 통째 교체)  
- 단일 Mongo document save → 사실상 원자적  
- Validation 실패 시 저장 안 함  
- `id` 없으면 서버가 `item-{timestamp}-{random}` 생성  
- 요청에 없는 item = 삭제

### reorder

```json
{ "day": 1, "itemIds": ["item-3", "item-1", "item-2"] }
```

같은 day 순서만. 시간 변경/날짜 이동 불가.

---

## 11. Compatibility

- `GET .../compatibility` ≡ `GET .../match-result`  
- 멤버 `travelTypeSnapshot.tags` 교집합 점수  
- **실질 2인 로직** (`calculateMatchResult`가 앞 2명만 사용)  
- 2명 미만: score 0 + “동행자 정보가 부족합니다.”  
- 3명+: 앞 2명만 — **그룹 진단은 프론트 로컬 유지 권장**  
- `adjustment-plan` / `courses`: **static template / rule stub**

---

## 12. Duri (대부분 stub)

| Endpoint | 구현 수준 | 자동 적용 가능? |
|----------|-----------|-----------------|
| suggest-places | stub 문구 | ❌ |
| suggest-order | heuristic (reverse itemIds) | 수동 적용 |
| fill-gaps | stub | ❌ |
| replace-place | stub | ❌ |
| reflect-preferences | compatibility 재사용 | ❌ |
| optimize | stub message | ❌ |
| generate-draft | stub days | 클라이언트가 PUT schedule |
| analysis-report | heuristic 저장 | 참고용 |
| analysis-report/latest | DB 조회 | 참고용 |

응답에 before/after schedule diff 구조 **없음**. 자동 적용은 연결하지 말고 참고용으로 쓰는 것이 맞음.

---

## 13. Invite

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

## 14. Onboarding

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

## 15. 프론트 연동 우선순위 체크리스트

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
