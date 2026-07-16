# Tourmate Backend

NestJS + MongoDB REST API for **Tourmate / TripMatch**.

프로덕션: https://backend-1-e3sv.onrender.com  
Swagger: https://backend-1-e3sv.onrender.com/api/docs  
Base path: `/api/v1`

---

## Frontend 연동

| 자료 | 경로 |
|------|------|
| **Swagger UI** (필드·예시 포함) | `/api/docs` — GET 펼치면 **Responses → 200** |
| **API 계약** | [`FRONTEND_API_CONTRACT.md`](./FRONTEND_API_CONTRACT.md) |
| **OpenAPI JSON** | [`openapi.json`](./openapi.json) (`npm run openapi:generate`) |
| **환경 변수** | [`.env.example`](./.env.example) |

프론트는 **이 서버만** 호출합니다. `data.go.kr` / Kakao를 앱에서 직접 부르지 마세요.

---

## Stack

- NestJS 11 · MongoDB (Mongoose) · JWT (access + refresh, **JSON body**)
- 한국관광공사 TourAPI **KorService2** + 특화 서비스 (연관·중심·방문자·혼잡)
- Kakao Local (보조 POI)

---

## Setup

권장: **Node.js 20+**, MongoDB 로컬 또는 Atlas.

```bash
cd Backend
cp .env.example .env   # MONGODB_URI, JWT_*, TOUR_API_SERVICE_KEY 채우기
npm install
npm run start:dev
```

| | URL |
|--|-----|
| Base | `http://localhost:3000/api/v1` |
| Swagger | `http://localhost:3000/api/docs` |

### 환경 변수 (요약)

| 변수 | 용도 |
|------|------|
| `MONGODB_URI` | MongoDB (로컬 또는 Atlas) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT |
| `TOUR_API_SERVICE_KEY` | 관광공사 Decoding 키 (공통) |
| `TOUR_API_BASE_URL` | KorService2 |
| `TOUR_RELATED_API_BASE_URL` | 연관관광지 |
| `TOUR_HUB_API_BASE_URL` | 중심관광지 |
| `TOUR_DATALAB_API_BASE_URL` | 방문자수 |
| `TOUR_CNCTR_API_BASE_URL` | 혼잡·집중률 |
| `KAKAO_REST_API_KEY` | 선택. 없으면 `/places/search`는 DB fallback |

---

## 장소 API가 두 종류인 이유

| Prefix | 소스 | 언제 쓰나 | 식별자 |
|--------|------|-----------|--------|
| **`/tour/*`** | 관광공사 KorService2 (+특화) | **관광지·축제·숙박·상세 (메인)** | `contentId` |
| **`/places/*`** | Kakao + DB | 카페·상점 등 보조 POI | Mongo `placeId` |

여행방 후보: `POST /rooms/:id/candidates`에 **`placeId` 또는 `tourContentId`** 중 하나.

### `contentId`란? (상세 URL 끝 숫자)

`GET /tour/places/{contentId}` 경로의 숫자는 **한국관광공사가 부여한 관광 콘텐츠 ID**입니다.  
`contentTypeId`(12=관광지, 39=음식점 …)와는 **다릅니다.** `12`를 path에 넣으면 안 됩니다.

| 이름 | 어디서 쓰나 | 예시 |
|------|-------------|------|
| **contentId** | 상세·유사·혼잡 path | `126508`(경복궁), `2871024`(음식점) |
| **contentTypeId** | 목록 필터 / 상세 query(선택) | `12` 관광지 · `39` 음식점 |

**찾는 방법 (프론트 흐름)**

1. 목록/검색으로 ID를 받은 뒤 → 상세 호출  
   - `GET /tour/places?areaCode=1&contentTypeId=39` → 응답 각 항목의 **`id`** (= contentId)  
   - `GET /tour/places/search?keyword=경복궁` → 같은 방식  
2. 그 `id`로 상세: `GET /tour/places/{id}`

**바로 눌러볼 예시 (프로덕션)**

| 유형 | URL |
|------|-----|
| 관광지(경복궁) | https://backend-1-e3sv.onrender.com/api/v1/tour/places/126508 |
| 음식점 | https://backend-1-e3sv.onrender.com/api/v1/tour/places/2871024 |
| 음식점 목록(서울) | https://backend-1-e3sv.onrender.com/api/v1/tour/places?areaCode=1&contentTypeId=39&size=5 |

---

## API 모듈

| 태그 (Swagger) | Prefix | 설명 |
|----------------|--------|------|
| 인증 | `/auth` | signup, login, refresh, logout, Kakao, join-by-invite |
| 유저 | `/users` | 프로필, TravelType, 여행 통계 |
| 저장 | `/users/me/saves` | 개인 장소 Save |
| 온보딩 | `/onboarding` | 가입 직후 짧은 설문 (quiz와 별개) |
| 두리 테스트 | `/quiz` | 성향 테스트 8문항 → TravelType |
| **관광 탐색 · TourAPI** | `/tour/places/*` 등 | 목록·검색·주변·상세·축제·숙박·펫·meta |
| **관광 인사이트 · 빅데이터** | `/tour/...` | similar, congestion, visitors, region highlights |
| 장소 · Kakao/DB | `/places` | Kakao/로컬 검색 (보조) |
| 인기 여행지 | `/destinations/popular` | Top 10 (popularityScore) |
| 여행방 | `/rooms` | 방·후보·일정·궁합·코스 |
| 초대 | `/invites` | 초대코드 수락 |
| 두리 도우미 | `/rooms/:id/duri` | 추천·초안·분석 (rule MVP) |

### TourAPI 주요 엔드포인트

| Method | Path | 역할 |
|--------|------|------|
| GET | `/tour/places` | 지역 목록 (`areaBasedList2`) |
| GET | `/tour/places/search` | 키워드 검색 |
| GET | `/tour/places/nearby` | GPS 주변 |
| GET | `/tour/places/:contentId` | 상세 (4개 API 병렬 합침 + DB upsert → `placeId`) |
| GET | `/tour/places/:contentId/similar` | 연관관광지 (실패 시 주변 fallback) |
| GET | `/tour/places/:contentId/congestion` | 향후 30일 혼잡도 (`busy` = rate≥60) |
| GET | `/tour/places/:contentId/pet` | 반려동물 동반 |
| GET | `/tour/festivals` | 축제 |
| GET | `/tour/stays` | 숙박 |
| GET | `/tour/regions/:areaCd/highlights` | 시군구 중심 관광지 |
| GET | `/tour/analytics/visitors` | 광역/기초 방문자수 |
| GET | `/tour/meta/ldong-codes` | 법정동 코드 |
| GET | `/tour/meta/category-codes` | 분류체계 코드 |

---

## 작업 로그 (Changelog)

날짜별로 **그날 추가·변경한 것**을 남깁니다. (최신 위)

### 2026-07-16
- README를 **날짜별 작업 로그** 형식으로 정리
- `contentId` / `contentTypeId` 구분·찾는 법·예시 URL 문서화 (프론트 공유용)
- Place DB 저장 방식 재확인·문서화: PK=`_id`, Tour `contentId` → `externalId`, `source: 'tour'` (Kakao와 충돌 방지)

### 2026-07-15
- Tour 특화 API 연동: 연관관광지 · 중심관광지(hub) · DataLab 방문자 · 집중률/혼잡
- 방문자 `touDivCd` 매핑 수정 (`1/2/3`)
- Swagger에서 「활용신청」 문구 제거
- Tour GET 응답 스키마·예시 추가
- 전 모듈(인증·유저·온보딩·퀴즈·rooms·초대·두리 등) Swagger `@ApiOkResponse` 응답 타입 보강
- `/destinations/popular` Swagger 예시 빈 `[{}]` 수정 (`PopularDestinationDto` + `isArray`)

### 2026-07-14
- KorService2 나머지 오퍼레이션 BFF (`/tour/places`, search, nearby, detail, festivals, stays, pet, meta…)
- 여행방 후보: `tourContentId`로 upsert 후 추가 (`placeId`와 병행)
- 유사 장소 엔드포인트 (`/tour/places/:contentId/similar`)
- Swagger 한글 태그·Tour vs Kakao(`/places`) 구분 가이드

### 2026-07-13
- TourAPI BFF 모듈·배포 경로 수정 (`tsconfig.build`에서 scripts 제외 → `dist/main.js`)
- Render + Atlas 프로덕션 연동 정리

### 이전 (요약)
- 인증·유저·온보딩·두리 테스트·여행방·초대·Kakao places MVP
- 온보딩 설문 / `test_results` 스키마를 User와 분리
- `FRONTEND_API_CONTRACT.md` · `DISCUSSION_CHECKLIST.md`

---

## Scripts

```bash
npm run start:dev
npm run build
npm run start:prod      # node dist/main
npm run openapi:generate
npm run test
npm run test:e2e
```

---

## Docs

- [`FRONTEND_API_CONTRACT.md`](./FRONTEND_API_CONTRACT.md) — 연동 계약·오류 포맷
- [`DISCUSSION_CHECKLIST.md`](./DISCUSSION_CHECKLIST.md) — 제품 미결
- Swagger: `/api/docs` — **Schemas** 섹션에서 DTO 전체 확인
