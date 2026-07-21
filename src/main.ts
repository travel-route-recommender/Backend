import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Tourmate API')
    .setDescription(
      `
Tourmate / TripMatch 백엔드 API입니다.  
프론트는 **이 서버만** 호출하면 되고, data.go.kr·Kakao를 직접 부르지 않습니다.

---

## 어떤 API를 쓰면 되나요? (빠른 가이드)

| 하고 싶은 일 | 쓸 태그 | 경로 예시 |
| --- | --- | --- |
| 회원가입·로그인 | **인증** | \`/auth/*\` |
| 내 프로필·저장 | **유저** / **저장** | \`/users/me\` |
| 회원가입 직후 짧은 설문 | **온보딩** | \`/onboarding/*\` |
| 두리 성향 테스트 | **두리 테스트** | \`/quiz/*\` |
| **관광지·축제·숙박 탐색 (메인)** | **관광 탐색 · TourAPI** | \`/tour/places/*\` |
| 연관·혼잡·방문자·중심스팟 | **관광 인사이트 · 빅데이터** | \`/tour/places/:id/similar\` · \`congestion\` · \`analytics/visitors\` · \`regions/:areaCd/highlights\` |
| 카페·상점 등 일반 POI (보조) | **장소 · Kakao/DB** | \`/places/search\` |
| 인기 여행지 Top | **인기 여행지** | \`/destinations/popular\` |
| 여행방·후보·일정 | **여행방** | \`/rooms/*\` |
| AI 코스 도우미 | **두리 도우미** | \`/rooms/:id/duri/*\` |

---

## 장소 API가 두 종류인 이유

1. **\`/tour/*\` (TourAPI · KorService2)**  
   한국관광공사 공식 관광 데이터. **탐색·상세·축제·숙박의 주축**입니다.  
   - 식별자: TourAPI \`contentId\` (숫자 문자열, 예: \`126508\`)  
   - 상세 조회 시 Mongo \`placeId\`도 함께 내려줍니다 (여행방 후보에 바로 연결 가능).

2. **\`/places/*\` (Kakao / DB)**  
   Kakao Local + 우리 DB. **카페·일반 상점** 등 관광공사에 없는 POI용 **보조**입니다.  
   - 식별자: Mongo \`placeId\` (ObjectId)

여행방 후보 추가 시: \`placeId\` **또는** \`tourContentId\` 중 하나만내면 됩니다.

---

## 인증

\`Authorize\` 버튼에 Bearer access token을 넣으세요.  
\`Authorization: Bearer <accessToken>\`

---

## 응답 스키마

각 GET을 펼치면 **Responses → 200**에 필드·예시가 있습니다.  
스키마 전체 목록은 페이지 하단 **Schemas**에서도 볼 수 있습니다.
      `.trim(),
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: '로그인/회원가입 응답의 accessToken',
    })
    // 태그 순서 = Swagger UI에 보이는 순서
    .addTag('인증', '회원가입 · 로그인 · 토큰 갱신 · 게스트 초대 입장')
    .addTag('유저', '내 프로필 · 여행 타입 · 온보딩 완료')
    .addTag('온보딩', '면허·자차·이동 제약·관심 태그 (두리 테스트와 별개)')
    .addTag(
      '두리 테스트',
      '세션·중간저장·완료 · 4축 rule-based TravelType + preference',
    )
    .addTag(
      '관광 탐색 · TourAPI',
      '한국관광공사 KorService2. 관광지·축제·숙박·상세의 메인 소스. contentId 기준.',
    )
    .addTag(
      '관광 인사이트 · 빅데이터',
      '연관관광지·중심스팟·방문자수·혼잡예측 (티맵·통신 빅데이터). similar는 연관 API 실패 시 주변 검색으로 fallback.',
    )
    .addTag(
      '장소 · Kakao/DB',
      'Kakao Local + 내부 DB. 일반 상점·카페 등 보조 검색. Mongo placeId 기준.',
    )
    .addTag('인기 여행지', '인기 Top 여행지 (popularityScore)')
    .addTag('여행방', '방 생성·초대·후보·일정·궁합')
    .addTag('초대', '초대 미리보기 · 기존 유저 초대 수락')
    .addTag('두리 도우미', '장소 추천·일정 초안·분석 리포트 (rule-based MVP)')
    .addTag('저장', '개인 장소 저장(Save) 목록')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Tourmate API Docs',
    swaggerOptions: {
      docExpansion: 'list',
      tagsSorter: 'none',
      operationsSorter: 'alpha',
      persistAuthorization: true,
      filter: true,
      displayRequestDuration: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
