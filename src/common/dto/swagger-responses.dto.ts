import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 두리 TravelType */
export class TravelTypeDto {
  @ApiProperty({ example: '감성 탐험가' })
  name: string;

  @ApiProperty({ example: '분위기 좋은 곳을 찾아다니는 타입' })
  description: string;

  @ApiProperty({ example: ['감성', '카페', '사진'] })
  tags: string[];

  @ApiProperty({ example: '동선이 길어질 수 있어요' })
  warning: string;

  @ApiProperty({ example: '📷' })
  emoji: string;
}

/** 공개 유저 프로필 (비밀번호 제외) */
export class PublicUserDto {
  @ApiProperty({ example: '665abc123def456789012345' })
  id: string;

  @ApiPropertyOptional({ example: 'test@example.com' })
  email?: string;

  @ApiProperty({ example: '윤지' })
  nickname: string;

  @ApiPropertyOptional({
    example: 'https://example.com/me.jpg',
    nullable: true,
  })
  profileImageUrl?: string | null;

  @ApiPropertyOptional({ type: TravelTypeDto, nullable: true })
  travelType?: TravelTypeDto | null;

  @ApiProperty({ example: false })
  onboardingCompleted: boolean;

  @ApiProperty({ example: false })
  isGuest: boolean;
}

export class UserListPageDto {
  @ApiProperty({ type: [PublicUserDto] })
  data: PublicUserDto[];

  @ApiProperty({
    example: { total: 42, page: 1, limit: 50 },
  })
  meta: { total: number; page: number; limit: number };
}

export class AuthTokensDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  refreshToken: string;

  @ApiProperty({ type: PublicUserDto })
  user: PublicUserDto;
}

export class AuthJoinByInviteDto extends AuthTokensDto {
  @ApiProperty({ example: '665abc123def456789012345' })
  roomId: string;
}

export class SuccessDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class MeStatsDto {
  @ApiProperty({ example: 2 })
  ongoingTrips: number;

  @ApiProperty({ example: 1 })
  completedTrips: number;
}

export class PersonalityAxesDto {
  @ApiProperty({ example: 72 })
  scheduleDensity: number;

  @ApiProperty({ example: 55 })
  landmarkNecessity: number;

  @ApiProperty({ example: 40 })
  localInterest: number;

  @ApiProperty({ example: 80 })
  challenging: number;
}

/** 본인 전체 프로필 (비밀 필드 제외) */
export class FullUserDto extends PublicUserDto {
  @ApiPropertyOptional({ example: 'kakao', nullable: true })
  oauthProvider?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: '두리 테스트 preference 캐시',
    example: { transport: 'car', budget: 'mid' },
  })
  quizPreferences?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: PersonalityAxesDto, nullable: true })
  personalityAxes?: PersonalityAxesDto | null;

  @ApiPropertyOptional({ example: true, nullable: true })
  hasLicense?: boolean | null;

  @ApiPropertyOptional({ example: false, nullable: true })
  hasCar?: boolean | null;

  @ApiProperty({
    type: String,
    isArray: true,
    example: ['STAIRS'],
    description: 'STAIRS | STEEP_SLOPE | LONG_WALK',
  })
  mobilityConstraints: string[];

  @ApiPropertyOptional({ example: 1999, nullable: true })
  birthYear?: number | null;

  @ApiProperty({ type: String, isArray: true, example: ['카페', '자연'] })
  interestTags: string[];

  @ApiPropertyOptional({ nullable: true })
  createdAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  updatedAt?: Date | null;
}

export class MeResponseDto extends FullUserDto {
  @ApiProperty({ type: MeStatsDto })
  stats: MeStatsDto;
}

export class TripsSummaryDto {
  @ApiProperty({ example: 2 })
  ongoing: number;

  @ApiProperty({ example: 1 })
  completed: number;
}

/** Tour / Kakao / DB 공통 장소 카드 */
export class CommonPlaceDto {
  @ApiProperty({
    example: '665abc123def456789012345',
    description:
      '클라이언트 리스트 키. placeId 있으면 그것, 없으면 `{source}:{externalId}`',
  })
  id: string;

  @ApiProperty({
    example: '665abc123def456789012345',
    nullable: true,
    description:
      'Mongo places._id. Tour 목록(상세 전)은 null. 후보/저장에 사용',
  })
  placeId: string | null;

  @ApiProperty({
    example: '126435',
    description: 'Tour contentId 또는 Kakao place id',
  })
  externalId: string;

  @ApiProperty({ example: 'tour', enum: ['tour', 'kakao', 'manual'] })
  source: 'tour' | 'kakao' | 'manual';

  @ApiProperty({ example: '성산일출봉' })
  name: string;

  @ApiProperty({
    example: '제주특별자치도 서귀포시 성산읍',
    nullable: true,
  })
  address: string | null;

  @ApiProperty({ example: 33.458, nullable: true })
  lat: number | null;

  @ApiProperty({ example: 126.942, nullable: true })
  lng: number | null;

  @ApiProperty({
    example: 'http://tong.visitkorea.or.kr/.../thumb.jpg',
    nullable: true,
  })
  thumbnailUrl: string | null;

  @ApiProperty({
    type: String,
    isArray: true,
    example: ['http://tong.visitkorea.or.kr/.../image.jpg'],
  })
  images: string[];

  @ApiProperty({ example: '관광지', nullable: true })
  category: string | null;

  @ApiProperty({
    example: 12,
    nullable: true,
    description: 'Tour contentTypeId. Kakao/manual은 null',
  })
  contentTypeId: number | null;

  @ApiProperty({ example: '관광지', nullable: true })
  contentTypeLabel: string | null;

  @ApiProperty({ type: String, isArray: true, example: ['자연', '바다'] })
  tags: string[];

  @ApiProperty({ example: '064-123-4567', nullable: true })
  phone: string | null;

  @ApiProperty({ example: 'https://www.visitjeju.net/...', nullable: true })
  placeUrl: string | null;

  @ApiProperty({
    example: '유네스코 세계자연유산',
    nullable: true,
  })
  description: string | null;

  @ApiPropertyOptional({
    example: 88.37,
    description: '주변검색 등에서만. 기준점으로부터 거리(m)',
  })
  distanceMeters?: number;
}

/** @deprecated CommonPlaceDto 사용. 하위호환 별칭 */
export class PlaceDto extends CommonPlaceDto {}

/** /destinations/popular 응답 예시용 (select 필드만) */
export class PopularDestinationDto {
  @ApiProperty({ example: '6a54fefd03fd091206ac19c6' })
  _id: string;

  @ApiProperty({ example: '제주 성산일출봉' })
  name: string;

  @ApiProperty({ example: '제주특별자치도 서귀포시 성산읍' })
  address: string;

  @ApiProperty({ example: 33.458 })
  lat: number;

  @ApiProperty({ example: 126.942 })
  lng: number;

  @ApiProperty({
    type: String,
    isArray: true,
    example: [],
  })
  images: string[];

  @ApiProperty({
    type: String,
    isArray: true,
    example: ['자연', '바다', '사진스팟'],
  })
  tags: string[];

  @ApiProperty({ example: '관광' })
  category: string;

  @ApiProperty({ example: 100 })
  popularityScore: number;
}

export class PlaceSearchPageDto {
  @ApiProperty({ type: [CommonPlaceDto] })
  data: CommonPlaceDto[];

  @ApiProperty({
    example: { total: 20, page: 1, limit: 20 },
  })
  meta: { total: number; page: number; limit: number };
}

export class SavedPlaceItemDto {
  @ApiProperty({ example: '665...' })
  id: string;

  @ApiProperty()
  savedAt: Date;

  @ApiProperty({ type: CommonPlaceDto })
  place: CommonPlaceDto;
}

export class OnboardingStatusDto {
  @ApiProperty({ example: true })
  completed: boolean;

  @ApiProperty({ example: 3 })
  answeredCount: number;
}

export class OnboardingSurveyDto {
  @ApiPropertyOptional({
    example: { preferredCompanion: 'friends' },
  })
  answers?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true, nullable: true })
  hasLicense?: boolean | null;

  @ApiPropertyOptional({ example: false, nullable: true })
  hasCar?: boolean | null;

  @ApiProperty({
    example: ['STAIRS', 'LONG_WALK'],
    enum: ['STAIRS', 'STEEP_SLOPE', 'LONG_WALK'],
    isArray: true,
  })
  mobilityConstraints: string[];

  @ApiPropertyOptional({ example: 2003, nullable: true })
  birthYear?: number | null;

  @ApiPropertyOptional({ example: 23, nullable: true })
  age?: number | null;

  @ApiProperty({ example: ['카페', '바다'] })
  tags: string[];

  @ApiPropertyOptional()
  completedAt?: Date;
}

export class QuizOptionDto {
  @ApiProperty({ example: 'A' })
  id: string;

  @ApiProperty({ example: '조용한 카페' })
  label: string;
}

export class QuizQuestionDto {
  @ApiProperty({ example: 'q1' })
  id: string;

  @ApiProperty({ example: '여행에서 가장 중요한 것은?' })
  question: string;

  @ApiProperty({ example: 'preference' })
  category: string;

  @ApiProperty({ type: [QuizOptionDto] })
  options: QuizOptionDto[];
}

export class QuizStatusDto {
  @ApiProperty({ example: true })
  completed: boolean;

  @ApiProperty({ example: true })
  onboardingCompleted: boolean;

  @ApiPropertyOptional({ example: '665abc123def456789012345', nullable: true })
  sessionId?: string | null;

  @ApiPropertyOptional({
    example: 'in_progress',
    enum: ['in_progress', 'completed'],
    nullable: true,
  })
  status?: string | null;

  @ApiProperty({ example: 3 })
  answeredCount: number;

  @ApiProperty({ example: 6 })
  totalQuestions: number;

  @ApiProperty({ example: 6 })
  totalSteps: number;
}

export class QuizSubmitResultDto {
  @ApiProperty({ type: TravelTypeDto })
  travelType: TravelTypeDto;

  @ApiProperty({ type: PublicUserDto, nullable: true })
  user: PublicUserDto | null;
}

export class RoomDestinationDto {
  @ApiProperty({ example: '제주' })
  name: string;

  @ApiPropertyOptional({ example: 'JEJU' })
  regionCode?: string;

  @ApiPropertyOptional({ example: 33.4996 })
  lat?: number;

  @ApiPropertyOptional({ example: 126.5312 })
  lng?: number;
}

export class RoomMemberDto {
  @ApiProperty({ example: '665...' })
  userId: string;

  @ApiProperty({ example: 'owner', enum: ['owner', 'member'] })
  role: string;

  @ApiProperty()
  joinedAt: Date;

  @ApiPropertyOptional({ type: TravelTypeDto })
  travelTypeSnapshot?: TravelTypeDto;
}

export class RoomProgressDto {
  @ApiProperty({ example: '일정 짜는 중' })
  label: string;

  @ApiProperty({ example: 3 })
  currentStep: number;

  @ApiProperty({ example: 60 })
  percent: number;
}

export class RoomDto {
  @ApiProperty({ example: '665...' })
  id: string;

  @ApiProperty({ example: '제주 3박4일' })
  title: string;

  @ApiPropertyOptional({ type: RoomDestinationDto })
  destination?: RoomDestinationDto;

  @ApiPropertyOptional()
  startDate?: Date;

  @ApiPropertyOptional()
  endDate?: Date;

  @ApiProperty({ example: 'ongoing', enum: ['ongoing', 'completed'] })
  status: string;

  @ApiProperty()
  createdBy: string;

  @ApiProperty({ type: [RoomMemberDto] })
  members: RoomMemberDto[];

  @ApiProperty({ example: 'ABCD1234' })
  inviteCode: string;

  @ApiPropertyOptional({ example: 'tripmatch://invite/ABCD1234' })
  inviteLink?: string;

  @ApiProperty({ type: RoomProgressDto })
  progress: RoomProgressDto;

  @ApiPropertyOptional({ example: 'jType', nullable: true })
  scheduleStyle?: string | null;

  @ApiPropertyOptional({ nullable: true })
  selectedCourseId?: string | null;

  @ApiProperty({ example: 5 })
  candidateCount: number;

  @ApiProperty({ example: 12 })
  scheduleItemCount: number;
}

export class OngoingTripDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: '제주 여행' })
  title: string;

  @ApiProperty({ example: '제주' })
  destination: string;

  @ApiProperty({ example: 'ongoing' })
  status: string;

  @ApiProperty({ example: '일정 짜는 중' })
  progressLabel: string;

  @ApiProperty({ example: '2026-07-14T12:00:00.000Z' })
  lastUpdated: string;

  @ApiProperty({ example: '제주 여행 계획' })
  summary: string;

  @ApiProperty({ example: 3 })
  currentStep: number;

  @ApiPropertyOptional({ example: '2026-07-25T00:00:00.000Z', nullable: true })
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2026-07-26T00:00:00.000Z', nullable: true })
  endDate?: string | null;

  @ApiProperty({ example: 3 })
  memberCount: number;

  @ApiPropertyOptional({ example: 2, nullable: true, description: '여행 일수' })
  durationDays?: number | null;

  @ApiProperty({ example: 5 })
  candidateCount: number;
}

export class InviteLinkDto {
  @ApiProperty({ example: 'ABCD1234' })
  inviteCode: string;

  @ApiProperty({ example: 'tripmatch://invite/ABCD1234' })
  inviteLink: string;
}

export class CandidateDto {
  @ApiProperty()
  placeId: string;

  @ApiProperty()
  addedBy: string;

  @ApiProperty()
  addedAt: Date;

  @ApiPropertyOptional({ example: '꼭 가고 싶어요' })
  note?: string;

  @ApiProperty({ example: false })
  scheduled: boolean;

  @ApiPropertyOptional({ type: CommonPlaceDto })
  place?: CommonPlaceDto;
}

export class ScheduleTicketDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({
    example: '/uploads/tickets/665abc123def456789012345/a1b2c3d4.jpg',
    description: '정적 경로. APP_BASE_URL을 앞에 붙여 표시',
  })
  imageUrl: string;

  @ApiProperty({ example: '665abc123def456789012345' })
  uploadedBy: string;

  @ApiPropertyOptional({ example: '사전 예매 QR' })
  note?: string;

  @ApiPropertyOptional({ example: 'ticket.jpg' })
  originalName?: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  mimeType?: string;

  @ApiProperty()
  createdAt: Date;
}

export class ScheduleTicketListDto {
  @ApiProperty({ type: [ScheduleTicketDto] })
  tickets: ScheduleTicketDto[];
}

export class ItineraryItemDto {
  @ApiProperty({ example: 'item-1' })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  placeId?: string | null;

  @ApiProperty({ example: '성산일출봉' })
  placeName: string;

  @ApiProperty({ example: '09:10', description: 'HH:mm — 분 단위 그대로 보존' })
  startTime: string;

  @ApiProperty({ example: '10:05' })
  endTime: string;

  @ApiProperty({ example: ['자연'] })
  tags: string[];

  @ApiProperty({ example: '일출 명소' })
  reason: string;

  @ApiProperty({ example: 'must', enum: ['must', 'optional', 'skip'] })
  priority: string;

  @ApiProperty({ example: 1 })
  day: number;

  @ApiPropertyOptional({ example: '2026-07-10', nullable: true })
  date?: string | null;

  @ApiPropertyOptional({ example: 33.458, nullable: true })
  lat?: number | null;

  @ApiPropertyOptional({ example: 126.942, nullable: true })
  lng?: number | null;

  @ApiProperty({ example: false })
  locked: boolean;

  @ApiPropertyOptional({ nullable: true })
  lockedBy?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lockedAt?: Date | null;

  @ApiPropertyOptional({ type: [ScheduleTicketDto], default: [] })
  tickets?: ScheduleTicketDto[];

  @ApiPropertyOptional({
    nullable: true,
    description: '사용자 확인 예약 (구조화). 이미지 티켓과 별개',
  })
  reservation?: Record<string, unknown> | null;
}

export class ScheduleDayDto {
  @ApiProperty({ example: 1 })
  day: number;

  @ApiProperty({ type: [ItineraryItemDto] })
  items: ItineraryItemDto[];
}

export class RoomScheduleDto {
  @ApiProperty({ type: [ScheduleDayDto] })
  days: ScheduleDayDto[];

  @ApiProperty({ example: 3 })
  scheduleVersion: number;

  @ApiPropertyOptional({ description: '숙소·복귀·이동수단·버퍼·timezone' })
  planning?: Record<string, unknown>;
}

export class MatchResultDto {
  @ApiProperty({ example: 78, nullable: true })
  compatibilityScore: number | null;

  @ApiProperty({ example: true })
  available: boolean;

  @ApiProperty({ example: ['카페', '자연'] })
  matchingAreas: string[];

  @ApiProperty({ example: ['쇼핑'] })
  adjustmentAreas: string[];

  @ApiProperty({ example: ['클럽'] })
  avoidAreas: string[];

  @ApiProperty({ example: '자연·카페에서 잘 맞아요' })
  summary: string;
}

export class WorkspaceDto {
  @ApiProperty({ type: RoomDto })
  room: RoomDto;

  @ApiProperty({ type: [CandidateDto] })
  candidates: CandidateDto[];

  @ApiProperty({ type: RoomScheduleDto })
  schedulePreview: RoomScheduleDto;
}

export class ScheduleMapDto {
  @ApiProperty({ type: [ItineraryItemDto] })
  items: ItineraryItemDto[];
}

export class ScheduleSummaryDto {
  @ApiProperty({ example: '제주 3박4일' })
  title: string;

  @ApiProperty({ example: '자연·카페 중심 일정' })
  description: string;

  @ApiProperty({ example: { 자연: 3, 카페: 2 } })
  preferences: Record<string, number>;

  @ApiProperty({ example: { '1일차': '성산·우도' } })
  dayPlans: Record<string, string>;
}

export class AnalysisReportDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  roomId: string;

  @ApiProperty({ example: 7 })
  scheduleVersion: number;

  @ApiProperty({ example: 12 })
  factsVersion: number;

  @ApiProperty({ example: 'evidence-v2' })
  analysisVersion: string;

  @ApiProperty({
    example: {
      available: true,
      totalDistance: 12.4,
      totalDurationSeconds: 1860,
      knownSegmentCount: 1,
      unknownSegmentCount: 0,
      segments: [
        {
          from: '성산',
          to: '우도',
          status: 'ok',
          distanceMeters: 8200,
          durationSeconds: 900,
          km: 8.2,
          source: 'kakao-mobility',
        },
      ],
      warnings: [],
    },
  })
  routeAnalysis: Record<string, unknown>;

  @ApiProperty({
    example: {
      available: false,
      estimated: null,
      reason: 'cost_data_not_collected',
      breakdown: [],
    },
  })
  budgetAnalysis: Record<string, unknown>;

  @ApiProperty({
    example: {
      method: 'union_occupied_minutes_over_calendar_day',
      scoreBasisMinutes: 1440,
      byDay: [
        {
          day: 1,
          score: 16.7,
          occupiedMinutes: 240,
          freeMinutesWithinSpan: 30,
          spanMinutes: 270,
          message: '총 240분 일정, 일정 사이 여유 30분입니다.',
        },
      ],
    },
  })
  densityAnalysis: Record<string, unknown>;

  @ApiProperty({
    example: {
      available: true,
      score: 80,
      method: 'mean_member_preferred_tag_coverage',
      confidence: 'complete',
      details: [],
    },
  })
  preferenceReflection: Record<string, unknown>;

  @ApiProperty({
    example: {
      overlaps: [],
      closedVenues: [],
      operatingHoursAvailable: false,
      operatingHoursReason: 'verified_operating_hours_not_available',
    },
  })
  conflictAnalysis: Record<string, unknown>;

  @ApiProperty({
    example: [{ type: 'route', message: '동선을 줄여보세요' }],
  })
  suggestions: { type: string; message: string }[];

  @ApiPropertyOptional({ description: '현재 입력보다 오래된 리포트인지 여부' })
  stale?: boolean;

  @ApiPropertyOptional({
    description: '교통 근거의 재조회 시간이 지난 리포트인지 여부',
  })
  evidenceExpired?: boolean;

  @ApiPropertyOptional()
  currentScheduleVersion?: number;

  @ApiPropertyOptional()
  currentFactsVersion?: number;
}
