/**
 * Static OpenAPI 3 export (no MongoDB required).
 * Keep in sync with controllers/DTOs when APIs change.
 * Usage: node scripts/generate-openapi.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const bearer = [{ bearer: [] }];

const PublicUser = {
  type: 'object',
  properties: {
    id: { type: 'string', example: '665abc123def456789012345' },
    email: { type: 'string', nullable: true, example: 'test@example.com' },
    nickname: { type: 'string', example: '윤지' },
    profileImageUrl: { type: 'string', nullable: true },
    travelType: {
      type: 'object',
      nullable: true,
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        warning: { type: 'string' },
        emoji: { type: 'string' },
      },
    },
    onboardingCompleted: { type: 'boolean' },
    isGuest: { type: 'boolean' },
  },
};

const AuthTokens = {
  type: 'object',
  required: ['accessToken', 'refreshToken', 'user'],
  properties: {
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    user: PublicUser,
  },
};

const ErrorBody = {
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    message: {
      oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    },
    error: { type: 'string' },
  },
};

const Place = {
  type: 'object',
  properties: {
    _id: { type: 'string' },
    externalId: { type: 'string', nullable: true },
    source: { type: 'string', enum: ['kakao', 'manual'] },
    name: { type: 'string' },
    address: { type: 'string' },
    lat: { type: 'number', nullable: true },
    lng: { type: 'number', nullable: true },
    images: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    category: { type: 'string', nullable: true },
    avgCost: { type: 'number', nullable: true },
    openingHours: { type: 'string', nullable: true },
    popularityScore: { type: 'number' },
    phone: { type: 'string', nullable: true },
    placeUrl: { type: 'string', nullable: true },
  },
};

const Room = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    destination: {
      type: 'object',
      nullable: true,
      properties: {
        name: { type: 'string' },
        regionCode: { type: 'string' },
        lat: { type: 'number' },
        lng: { type: 'number' },
      },
    },
    startDate: { type: 'string', format: 'date-time', nullable: true },
    endDate: { type: 'string', format: 'date-time', nullable: true },
    status: { type: 'string', enum: ['ongoing', 'completed'] },
    createdBy: { type: 'string' },
    members: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          role: { type: 'string', enum: ['owner', 'member'] },
          joinedAt: { type: 'string', format: 'date-time' },
          travelTypeSnapshot: { type: 'object', nullable: true },
        },
      },
    },
    inviteCode: { type: 'string' },
    inviteLink: { type: 'string' },
    progress: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        currentStep: { type: 'number' },
        percent: { type: 'number' },
      },
    },
    scheduleStyle: {
      type: 'string',
      enum: ['jType', 'pType'],
      nullable: true,
    },
    selectedCourseId: { type: 'string', nullable: true },
    candidateCount: { type: 'number' },
    scheduleItemCount: { type: 'number' },
  },
};

const ScheduleItem = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    placeId: { type: 'string', nullable: true },
    placeName: { type: 'string' },
    startTime: { type: 'string', example: '09:00' },
    endTime: { type: 'string', example: '11:00' },
    tags: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
    priority: { type: 'string', enum: ['must', 'optional', 'skip'] },
    day: { type: 'number' },
    lat: { type: 'number', nullable: true },
    lng: { type: 'number', nullable: true },
  },
};

const json = (schema, example) => ({
  content: {
    'application/json': {
      schema,
      ...(example ? { example } : {}),
    },
  },
});

const doc = {
  openapi: '3.0.0',
  info: {
    title: 'Tourmate API',
    description:
      'TripMatch / Tourmate NestJS REST API. Base path: /api/v1. Auth: Authorization Bearer accessToken. Refresh tokens are JSON body only (no cookies). Korean Tourism OpenAPI (KTO) is NOT integrated yet — places use Kakao Local + manual seed.',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:3000/api/v1', description: 'Local' }],
  components: {
    securitySchemes: {
      bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      PublicUser,
      AuthTokens,
      ErrorBody,
      Place,
      Room,
      ScheduleItem,
      LoginDto: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
      SignupDto: {
        type: 'object',
        required: ['nickname', 'email', 'password'],
        properties: {
          nickname: { type: 'string', minLength: 2 },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
      RefreshTokenDto: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
      CreateRoomDto: {
        type: 'object',
        properties: {
          title: { type: 'string', maxLength: 100 },
        },
      },
      UpdateRoomDto: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
          status: { type: 'string', enum: ['ongoing', 'completed'] },
        },
      },
      UpdateDestinationDto: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: '제주' },
          regionCode: { type: 'string', example: 'JEJU' },
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      },
      AddCandidateDto: {
        type: 'object',
        required: ['placeId'],
        properties: {
          placeId: { type: 'string' },
          note: { type: 'string' },
        },
      },
      ScheduleItemDto: ScheduleItem,
      ReorderScheduleDto: {
        type: 'object',
        required: ['day', 'itemIds'],
        properties: {
          day: { type: 'number', example: 1 },
          itemIds: {
            type: 'array',
            items: { type: 'string' },
            example: ['item-3', 'item-1', 'item-2'],
          },
        },
      },
      BatchScheduleDto: {
        type: 'object',
        required: ['days'],
        properties: {
          days: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'number' },
                items: { type: 'array', items: ScheduleItem },
              },
            },
          },
        },
      },
      SubmitQuizDto: {
        type: 'object',
        required: ['answers'],
        properties: {
          answers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            example: {
              q1: 'q1_a',
              q2: 'q2_b',
              q3: 'q3_a',
              q4: 'q4_b',
              q5: 'q5_a',
              q6: 'q6_b',
              q7: 'q7_a',
              q8: 'q8_b',
            },
          },
        },
      },
      SavePlaceDto: {
        type: 'object',
        required: ['placeId'],
        properties: {
          placeId: { type: 'string' },
          roomId: { type: 'string', nullable: true },
        },
      },
      TourPlaceCard: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'TourAPI contentId' },
          source: { type: 'string', enum: ['TOUR_API'] },
          contentTypeId: { type: 'integer' },
          contentTypeLabel: { type: 'string', nullable: true },
          name: { type: 'string' },
          address: { type: 'string', nullable: true },
          thumbnailUrl: { type: 'string', nullable: true },
          latitude: { type: 'number', nullable: true },
          longitude: { type: 'number', nullable: true },
          distanceMeters: { type: 'number', description: 'nearby에서만' },
        },
      },
      TourPlacePage: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/TourPlaceCard' },
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'integer' },
              page: { type: 'integer' },
              size: { type: 'integer' },
            },
          },
        },
      },
      TourPlaceDetail: {
        allOf: [
          { $ref: '#/components/schemas/TourPlaceCard' },
          {
            type: 'object',
            properties: {
              placeId: {
                type: 'string',
                nullable: true,
                description: 'mongo places _id (후보/저장 연결용)',
              },
              overview: { type: 'string', nullable: true },
              homepage: { type: 'string', nullable: true, description: 'HTML anchor 포함 가능' },
              tel: { type: 'string', nullable: true },
              images: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    url: { type: 'string' },
                    thumbnailUrl: { type: 'string' },
                    name: { type: 'string' },
                  },
                },
              },
              intro: { type: 'object', description: 'contentTypeId별 필드 상이' },
              repeatingInfo: { type: 'array', items: { type: 'object' } },
            },
          },
        ],
      },
    },
  },
  paths: {
    '/auth/signup': {
      post: {
        tags: ['auth'],
        summary: '이메일 회원가입',
        requestBody: json({ $ref: '#/components/schemas/SignupDto' }),
        responses: {
          201: {
            description: 'tokens + user',
            ...json({ $ref: '#/components/schemas/AuthTokens' }),
          },
          409: {
            description: 'Email already registered',
            ...json({ $ref: '#/components/schemas/ErrorBody' }),
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: '이메일 로그인',
        requestBody: json({ $ref: '#/components/schemas/LoginDto' }),
        responses: {
          201: {
            description: 'tokens + user',
            ...json({ $ref: '#/components/schemas/AuthTokens' }),
          },
          401: {
            description: 'Invalid credentials',
            ...json({ $ref: '#/components/schemas/ErrorBody' }),
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['auth'],
        summary: 'refreshToken(JSON body)로 access/refresh 재발급',
        description:
          'Cookie 미사용. Body.refreshToken 필수. 성공 시 새 accessToken + refreshToken + user.',
        requestBody: json({ $ref: '#/components/schemas/RefreshTokenDto' }),
        responses: {
          201: {
            description: '새 토큰',
            ...json({ $ref: '#/components/schemas/AuthTokens' }),
          },
          401: {
            description: 'Invalid refresh token',
            ...json({ $ref: '#/components/schemas/ErrorBody' }),
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['auth'],
        security: bearer,
        summary: '로그아웃 (해당 refreshToken 폐기)',
        requestBody: json({ $ref: '#/components/schemas/RefreshTokenDto' }),
        responses: {
          201: {
            description: 'success',
            ...json({
              type: 'object',
              properties: { success: { type: 'boolean' } },
            }),
          },
        },
      },
    },
    '/auth/oauth/kakao': {
      post: {
        tags: ['auth'],
        summary: 'Kakao OAuth — 프론트는 Kakao SDK access token 전달',
        requestBody: json({
          type: 'object',
          required: ['accessToken'],
          properties: {
            accessToken: {
              type: 'string',
              description: 'Kakao SDK access token (NOT our JWT)',
            },
          },
        }),
        responses: {
          201: {
            description: 'tokens + user',
            ...json({ $ref: '#/components/schemas/AuthTokens' }),
          },
        },
      },
    },
    '/auth/join-by-invite': {
      post: {
        tags: ['auth'],
        summary: '게스트 생성 + 초대코드로 room 입장 (인증 불필요)',
        requestBody: json({
          type: 'object',
          required: ['inviteCode', 'nickname'],
          properties: {
            inviteCode: { type: 'string', example: 'ABCD1234' },
            nickname: { type: 'string', minLength: 2 },
          },
        }),
        responses: {
          201: {
            description: 'tokens + user + roomId',
            ...json({
              allOf: [
                { $ref: '#/components/schemas/AuthTokens' },
                {
                  type: 'object',
                  properties: { roomId: { type: 'string' } },
                },
              ],
            }),
          },
        },
      },
    },
    '/users/me': {
      get: {
        tags: ['users'],
        security: bearer,
        summary: '내 프로필 + 여행 통계',
        responses: {
          200: {
            description: 'public user + stats',
            ...json({
              allOf: [
                PublicUser,
                {
                  type: 'object',
                  properties: {
                    stats: {
                      type: 'object',
                      properties: {
                        ongoingTrips: { type: 'number' },
                        completedTrips: { type: 'number' },
                      },
                    },
                  },
                },
              ],
            }),
          },
        },
      },
    },
    '/users/me/travel-type': {
      get: {
        tags: ['users'],
        security: bearer,
        summary: 'TravelType (User 캐시 / null 가능)',
        responses: { 200: { description: 'TravelType or null' } },
      },
    },
    '/users/me/trips-summary': {
      get: {
        tags: ['users'],
        security: bearer,
        summary: 'ongoing / completed 여행 수',
        responses: {
          200: {
            ...json({
              type: 'object',
              properties: {
                ongoing: { type: 'number' },
                completed: { type: 'number' },
              },
            }),
          },
        },
      },
    },
    '/users/me/profile': {
      patch: {
        tags: ['users'],
        security: bearer,
        summary: '프로필 수정 (nickname, profileImageUrl만)',
        requestBody: json({
          type: 'object',
          properties: {
            nickname: { type: 'string', maxLength: 50 },
            profileImageUrl: { type: 'string', format: 'uri' },
          },
        }),
        responses: {
          200: { ...json({ $ref: '#/components/schemas/PublicUser' }) },
        },
      },
    },
    '/users/me/onboarding-complete': {
      patch: {
        tags: ['users'],
        security: bearer,
        summary: 'onboardingCompleted = true',
        responses: {
          200: { ...json({ $ref: '#/components/schemas/PublicUser' }) },
        },
      },
    },
    '/users/me/saves': {
      get: {
        tags: ['user-saves'],
        security: bearer,
        summary: '개인 저장 목록 (Place 객체 include)',
        responses: {
          200: {
            ...json({
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  savedAt: { type: 'string', format: 'date-time' },
                  place: Place,
                },
              },
            }),
          },
        },
      },
      post: {
        tags: ['user-saves'],
        security: bearer,
        summary: '장소 저장 (upsert). roomId optional',
        requestBody: json({ $ref: '#/components/schemas/SavePlaceDto' }),
        responses: { 201: { description: 'UserSave document' } },
      },
    },
    '/users/me/saves/{placeId}': {
      delete: {
        tags: ['user-saves'],
        security: bearer,
        parameters: [
          { name: 'placeId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '저장 해제 (roomId null인 개인 저장만)',
        responses: {
          200: {
            ...json({
              type: 'object',
              properties: { success: { type: 'boolean' } },
            }),
          },
        },
      },
    },
    '/quiz/questions': {
      get: {
        tags: ['quiz'],
        summary: '두리 테스트 8문항 (비인증)',
        responses: {
          200: {
            description: 'questions array',
            ...json({
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', example: 'q1' },
                  question: { type: 'string' },
                  category: { type: 'string' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: 'q1_a' },
                        label: { type: 'string' },
                      },
                    },
                  },
                },
              },
            }),
          },
        },
      },
    },
    '/quiz/status': {
      get: {
        tags: ['quiz'],
        security: bearer,
        summary: '퀴즈 완료 상태 (test_results 기준)',
        responses: {
          200: {
            ...json({
              type: 'object',
              properties: {
                completed: { type: 'boolean' },
                onboardingCompleted: { type: 'boolean' },
                answeredCount: { type: 'number' },
                totalQuestions: { type: 'number', example: 8 },
              },
            }),
          },
        },
      },
    },
    '/quiz/submit': {
      post: {
        tags: ['quiz'],
        security: bearer,
        summary: '답변 제출 → TravelType. answers는 Record<questionId, optionId>',
        requestBody: json({ $ref: '#/components/schemas/SubmitQuizDto' }),
        responses: {
          201: {
            ...json({
              type: 'object',
              properties: {
                travelType: { type: 'object' },
                user: PublicUser,
              },
            }),
          },
        },
      },
    },
    '/onboarding/status': {
      get: {
        tags: ['onboarding'],
        security: bearer,
        summary: '가입 설문 상태',
        responses: { 200: { description: 'completed, answeredCount' } },
      },
    },
    '/onboarding/survey': {
      get: {
        tags: ['onboarding'],
        security: bearer,
        summary: '가입 설문 조회',
        responses: { 200: { description: 'answers + completedAt or null' } },
      },
      post: {
        tags: ['onboarding'],
        security: bearer,
        summary: '가입 설문 제출',
        requestBody: json({
          type: 'object',
          required: ['answers'],
          properties: {
            answers: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
          },
        }),
        responses: { 201: { description: 'saved survey' } },
      },
    },
    '/rooms': {
      post: {
        tags: ['rooms'],
        security: bearer,
        summary: '여행방 생성. title만 optional. owner/invite 자동 생성',
        description:
          '저장하지 않는 프론트 필드: 예산, 이동수단, 일정 밀도, 여행 목적. destination/dates는 이후 PATCH.',
        requestBody: json({ $ref: '#/components/schemas/CreateRoomDto' }),
        responses: {
          201: { ...json({ $ref: '#/components/schemas/Room' }) },
        },
      },
    },
    '/rooms/from-compatibility': {
      post: {
        tags: ['rooms'],
        security: bearer,
        summary: '멤버 userId 목록으로 방 생성',
        requestBody: json({
          type: 'object',
          required: ['memberUserIds'],
          properties: {
            memberUserIds: { type: 'array', items: { type: 'string' } },
            title: { type: 'string' },
          },
        }),
        responses: {
          201: { ...json({ $ref: '#/components/schemas/Room' }) },
        },
      },
    },
    '/rooms/me': {
      get: {
        tags: ['rooms'],
        security: bearer,
        summary: '내 여행방 목록',
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['ongoing', 'completed'] },
          },
        ],
        responses: { 200: { description: 'summary array' } },
      },
    },
    '/rooms/{roomId}': {
      get: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { ...json({ $ref: '#/components/schemas/Room' }) },
        },
      },
      patch: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: json({ $ref: '#/components/schemas/UpdateRoomDto' }),
        responses: {
          200: { ...json({ $ref: '#/components/schemas/Room' }) },
        },
      },
    },
    '/rooms/{roomId}/destination': {
      patch: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '여행지 설정 (destinationId 없음 — name/regionCode/lat/lng)',
        requestBody: json({
          $ref: '#/components/schemas/UpdateDestinationDto',
        }),
        responses: {
          200: { ...json({ $ref: '#/components/schemas/Room' }) },
        },
      },
    },
    '/rooms/{roomId}/candidates': {
      get: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '후보 목록 (Place include). scheduled는 schedule 파생 sync',
        responses: { 200: { description: 'candidate[]' } },
      },
      post: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '후보 추가. 동일 placeId+addedBy 중복 시 no-op 후 목록 반환',
        requestBody: json({ $ref: '#/components/schemas/AddCandidateDto' }),
        responses: { 201: { description: 'candidate list' } },
      },
    },
    '/rooms/{roomId}/candidates/{placeId}': {
      delete: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'placeId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '본인 후보만 삭제 (타인 후보는 필터에서 제외되어 조용히 무시)',
        responses: {
          200: {
            ...json({
              type: 'object',
              properties: { success: { type: 'boolean' } },
            }),
          },
        },
      },
    },
    '/rooms/{roomId}/schedule': {
      get: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            ...json({
              type: 'object',
              properties: {
                days: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      day: { type: 'number' },
                      items: { type: 'array', items: ScheduleItem },
                    },
                  },
                },
              },
            }),
          },
        },
      },
      put: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary:
          '전체 schedule replace (단일 document save). id 없으면 서버 생성. Place 객체는 미포함.',
        requestBody: json({ $ref: '#/components/schemas/BatchScheduleDto' }),
        responses: { 200: { description: 'updated schedule' } },
      },
    },
    '/rooms/{roomId}/schedule/items': {
      post: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '일정 항목 추가. placeName/startTime/endTime 필수. placeId optional',
        requestBody: json({ $ref: '#/components/schemas/ScheduleItemDto' }),
        responses: { 201: { ...json(ScheduleItem) } },
      },
    },
    '/rooms/{roomId}/schedule/reorder': {
      patch: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '같은 day 내 itemIds 순서만 변경. 날짜 이동/시간 변경은 PATCH items/:id',
        requestBody: json({ $ref: '#/components/schemas/ReorderScheduleDto' }),
        responses: { 200: { description: 'day plan' } },
      },
    },
    '/rooms/{roomId}/schedule/items/{itemId}': {
      patch: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '시간/priority/day 이동',
        requestBody: json({
          type: 'object',
          properties: {
            placeName: { type: 'string' },
            startTime: { type: 'string' },
            endTime: { type: 'string' },
            priority: { type: 'string', enum: ['must', 'optional', 'skip'] },
            day: { type: 'number' },
          },
        }),
        responses: { 200: { ...json(ScheduleItem) } },
      },
      delete: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: {
            ...json({
              type: 'object',
              properties: { success: { type: 'boolean' } },
            }),
          },
        },
      },
    },
    '/rooms/{roomId}/invite-link': {
      get: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: 'inviteCode + inviteLink (default scheme: tripmatch://invite/:code)',
        responses: { 200: { description: '{ inviteCode, inviteLink }' } },
      },
    },
    '/rooms/{roomId}/invites': {
      post: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '초대코드 재발급 (owner only). 기존 코드 즉시 무효',
        responses: {
          201: { description: '{ inviteCode, inviteLink }' },
          403: { description: 'Only owner can regenerate invite' },
        },
      },
    },
    '/rooms/{roomId}/compatibility': {
      get: {
        tags: ['rooms'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary:
          '2인 tag intersection heuristic. 멤버 2명 미만이면 score 0. 3명+는 앞 2명만 사용',
        responses: { 200: { description: 'compatibilityScore, matchingAreas, ...' } },
      },
    },
    '/rooms/{roomId}/duri/suggest-places': {
      post: {
        tags: ['duri'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: 'STUB / heuristic — 자동 적용용 schedule change 미포함',
        responses: { 201: { description: 'suggestions[] text only' } },
      },
    },
    '/rooms/{roomId}/duri/generate-draft': {
      post: {
        tags: ['duri'],
        security: bearer,
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: 'STUB draft schedule. DB 미저장 — 클라이언트가 PUT /schedule로 적용',
        responses: { 201: { description: 'days[] draft' } },
      },
    },
    '/invites/{code}/accept': {
      post: {
        tags: ['invites'],
        security: bearer,
        parameters: [
          { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: '기존 유저가 초대코드로 참여',
        responses: {
          201: { ...json({ $ref: '#/components/schemas/Room' }) },
        },
      },
    },
    '/places/search': {
      get: {
        tags: ['places'],
        summary: 'q 검색. Kakao 키 있으면 Kakao→DB upsert, 실패/무키면 로컬 DB. KTO 미연동',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'lat', in: 'query', schema: { type: 'number' } },
          { name: 'lng', in: 'query', schema: { type: 'number' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: {
            ...json({
              type: 'object',
              properties: {
                data: { type: 'array', items: Place },
                meta: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    page: { type: 'number' },
                    limit: { type: 'number' },
                  },
                },
              },
            }),
          },
        },
      },
    },
    '/places/{placeId}': {
      get: {
        tags: ['places'],
        parameters: [
          { name: 'placeId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { ...json(Place) }, 404: { description: 'Place not found' } },
      },
    },
    '/places/{placeId}/similar': {
      get: {
        tags: ['places'],
        parameters: [
          { name: 'placeId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        summary: 'tags/category heuristic (KTO 연관관광지 미연동)',
        responses: { 200: { ...json({ type: 'array', items: Place }) } },
      },
    },
    '/destinations/popular': {
      get: {
        tags: ['destinations'],
        summary:
          '인기 Top10 = places popularityScore. GET /destinations·검색 API 없음. destinationId 개념 없음',
        responses: { 200: { ...json({ type: 'array', items: Place }) } },
      },
    },
    '/tour/places': {
      get: {
        tags: ['tour'],
        summary:
          '한국관광공사 KorService2 지역기반 목록 (areaBasedList2). 비인증',
        parameters: [
          { name: 'areaCode', in: 'query', schema: { type: 'string' } },
          { name: 'sigunguCode', in: 'query', schema: { type: 'string' } },
          {
            name: 'contentTypeId',
            in: 'query',
            schema: { type: 'integer', enum: [12, 14, 15, 25, 28, 32, 38, 39] },
          },
          { name: 'arrange', in: 'query', schema: { type: 'string', example: 'O' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { ...json({ $ref: '#/components/schemas/TourPlacePage' }) },
          502: {
            description: 'TOUR_API_UNAVAILABLE / TOUR_API_ERROR',
            ...json({ $ref: '#/components/schemas/ErrorBody' }),
          },
        },
      },
    },
    '/tour/places/search': {
      get: {
        tags: ['tour'],
        summary: 'KorService2 키워드 검색 (searchKeyword2). 비인증',
        parameters: [
          { name: 'keyword', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'areaCode', in: 'query', schema: { type: 'string' } },
          { name: 'sigunguCode', in: 'query', schema: { type: 'string' } },
          {
            name: 'contentTypeId',
            in: 'query',
            schema: { type: 'integer', enum: [12, 14, 15, 25, 28, 32, 38, 39] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { ...json({ $ref: '#/components/schemas/TourPlacePage' }) },
        },
      },
    },
    '/tour/places/nearby': {
      get: {
        tags: ['tour'],
        summary:
          'KorService2 주변 검색 (locationBasedList2, 거리순). 비인증. distanceMeters 포함',
        parameters: [
          { name: 'mapX', in: 'query', required: true, schema: { type: 'number' }, description: '경도' },
          { name: 'mapY', in: 'query', required: true, schema: { type: 'number' }, description: '위도' },
          { name: 'radius', in: 'query', schema: { type: 'integer', default: 2000, maximum: 20000 } },
          {
            name: 'contentTypeId',
            in: 'query',
            schema: { type: 'integer', enum: [12, 14, 15, 25, 28, 32, 38, 39] },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'size', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { ...json({ $ref: '#/components/schemas/TourPlacePage' }) },
        },
      },
    },
    '/tour/places/{contentId}': {
      get: {
        tags: ['tour'],
        summary:
          'KorService2 상세 (detailCommon2+Intro+Info+Image 병렬 조합). places에 upsert 후 placeId(mongo) 반환. 비인증',
        parameters: [
          { name: 'contentId', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'contentTypeId',
            in: 'query',
            schema: { type: 'integer', enum: [12, 14, 15, 25, 28, 32, 38, 39] },
          },
        ],
        responses: {
          200: { ...json({ $ref: '#/components/schemas/TourPlaceDetail' }) },
          502: {
            description: 'TOUR_API_UNAVAILABLE',
            ...json({ $ref: '#/components/schemas/ErrorBody' }),
          },
        },
      },
    },
  },
};

const out = join(__dirname, '..', 'openapi.json');
writeFileSync(out, JSON.stringify(doc, null, 2));
console.log(`Wrote ${out}`);
