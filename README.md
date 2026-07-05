# Tourmate Backend

Node.js (NestJS) + MongoDB REST API for TripMatch / Tourmate.

## Stack

- NestJS 11
- MongoDB + Mongoose
- JWT (access + refresh)
- Swagger: `/api/docs`

Full API inventory (Notion-style): [`BACKEND.md`](./BACKEND.md)

## Setup

```bash
cd Backend
cp .env.example .env
npm install
npm run start:dev
```

Base URL: `http://localhost:3000/api/v1`

## Environment

See [`.env.example`](./.env.example). Minimum required:

- `MONGODB_URI`
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`

Optional:

- `KAKAO_REST_API_KEY` — Kakao Local API for place search

## API Modules

| Module | Prefix | Description |
|--------|--------|-------------|
| Auth | `/auth` | login, signup, refresh, join-by-invite, Kakao OAuth |
| Users | `/users` | profile, travel type, saves |
| Quiz | `/quiz` | onboarding questions & submit |
| Rooms | `/rooms` | travel rooms, candidates, schedule, matching |
| Places | `/places` | search, detail, similar |
| Destinations | `/destinations` | popular destinations |
| Duri | `/rooms/:id/duri` | analysis & suggestions (rule-based MVP) |
| Invites | `/invites` | accept invite code |

## Discussion Checklist

See [`DISCUSSION_CHECKLIST.md`](./DISCUSSION_CHECKLIST.md) for open product questions per screen owner.

## Scripts

```bash
npm run start:dev   # watch mode
npm run build
npm run test
npm run test:e2e
```
