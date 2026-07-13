# Tourmate Backend

Node.js (NestJS) + MongoDB REST API for TripMatch / Tourmate.

## Frontend 연동

프론트 팀이 바로 쓸 자료:

| 자료 | 경로 |
|------|------|
| **API 계약 (Auth/DTO/오류/예시)** | [`FRONTEND_API_CONTRACT.md`](./FRONTEND_API_CONTRACT.md) |
| **OpenAPI 3 JSON** | [`openapi.json`](./openapi.json) |
| **환경 변수 템플릿** | [`.env.example`](./.env.example) |
| Swagger UI (서버 실행 후) | `http://localhost:3000/api/docs` |

```bash
npm run openapi:generate   # Mongo 없이 openapi.json 재생성
```

## Stack

- NestJS 11
- MongoDB + Mongoose
- JWT (access + refresh, **JSON body refresh — cookie 없음**)
- Swagger: `/api/docs`

## Setup

권장: **Node.js 20+**, MongoDB 로컬 또는 Atlas.

```bash
cd Backend
cp .env.example .env
npm install
npm run start:dev
```

| | URL |
|--|-----|
| Base | `http://localhost:3000/api/v1` |
| Swagger | `http://localhost:3000/api/docs` |

### 환경 변수

`.env.example` 참고. 최소:

- `MONGODB_URI`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`

선택:

- `KAKAO_REST_API_KEY` — 없으면 장소 검색은 DB seed만
- `INVITE_LINK_BASE` — 기본 `tripmatch://invite`

실제 secret / 운영 credential은 공유하지 마세요.

### Seed / 테스트 계정

- `places` 비어 있으면 기동 시 자동 seed (제주·부산·경주·강릉 샘플)
- 계정 seed 없음 → `POST /api/v1/auth/signup`으로 생성

```json
{
  "nickname": "테스트",
  "email": "test@example.com",
  "password": "password123"
}
```

## API Modules

| Module | Prefix | Description |
|--------|--------|-------------|
| Auth | `/auth` | signup, login, refresh, logout, Kakao, join-by-invite |
| Users | `/users` | profile, travel-type, onboarding |
| User Saves | `/users/me/saves` | 개인 저장 (room 후보와 분리) |
| Quiz | `/quiz` | 두리 테스트 8문항 |
| Onboarding | `/onboarding` | 가입 설문 (quiz와 별개) |
| Rooms | `/rooms` | 여행방, 후보, 일정, 궁합 |
| Places | `/places` | Kakao/local 검색 (KTO 미연동) |
| Destinations | `/destinations` | popular Top 10 only |
| Duri | `/rooms/:id/duri` | rule/stub MVP |
| Invites | `/invites` | accept invite code |

## Scripts

```bash
npm run start:dev
npm run build
npm run openapi:generate
npm run test
npm run test:e2e
```

## Docs

- [`FRONTEND_API_CONTRACT.md`](./FRONTEND_API_CONTRACT.md) — 연동 계약
- [`BACKEND.md`](./BACKEND.md) — 내부 API inventory
- [`DISCUSSION_CHECKLIST.md`](./DISCUSSION_CHECKLIST.md) — 제품 미결 사항
