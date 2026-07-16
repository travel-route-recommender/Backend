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

  @ApiPropertyOptional({ example: 'https://example.com/me.jpg', nullable: true })
  profileImageUrl?: string | null;

  @ApiPropertyOptional({ type: TravelTypeDto, nullable: true })
  travelType?: TravelTypeDto | null;

  @ApiProperty({ example: false })
  onboardingCompleted: boolean;

  @ApiProperty({ example: false })
  isGuest: boolean;
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

export class MeResponseDto extends PublicUserDto {
  @ApiProperty({ type: MeStatsDto })
  stats: MeStatsDto;
}

export class TripsSummaryDto {
  @ApiProperty({ example: 2 })
  ongoing: number;

  @ApiProperty({ example: 1 })
  completed: number;
}

/** DB Place 문서 (Kakao/manual/tour) */
export class PlaceDto {
  @ApiProperty({ example: '665abc123def456789012345' })
  _id: string;

  @ApiPropertyOptional({ example: '126435' })
  externalId?: string;

  @ApiProperty({ example: 'tour', enum: ['kakao', 'manual', 'tour'] })
  source: string;

  @ApiPropertyOptional({ example: 12 })
  contentTypeId?: number;

  @ApiProperty({ example: '성산일출봉' })
  name: string;

  @ApiProperty({ example: '제주특별자치도 서귀포시 성산읍' })
  address: string;

  @ApiPropertyOptional({ example: 33.458 })
  lat?: number;

  @ApiPropertyOptional({ example: 126.942 })
  lng?: number;

  @ApiProperty({
    type: String,
    isArray: true,
    example: [
      'http://tong.visitkorea.or.kr/cms/resource/82/2944282_image2_1.jpg',
    ],
  })
  images: string[];

  @ApiProperty({ example: '유네스코 세계자연유산' })
  description: string;

  @ApiProperty({
    type: String,
    isArray: true,
    example: ['자연', '바다', '사진스팟'],
  })
  tags: string[];

  @ApiPropertyOptional({ example: '관광' })
  category?: string;

  @ApiProperty({ example: 100 })
  popularityScore: number;

  @ApiPropertyOptional({ example: '064-123-4567' })
  phone?: string;

  @ApiPropertyOptional({ example: 'https://...' })
  placeUrl?: string;
}

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
  @ApiProperty({ type: [PlaceDto] })
  data: PlaceDto[];

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

  @ApiProperty({ type: PlaceDto })
  place: PlaceDto;
}

export class OnboardingStatusDto {
  @ApiProperty({ example: true })
  completed: boolean;

  @ApiProperty({ example: 3 })
  answeredCount: number;
}

export class OnboardingSurveyDto {
  @ApiProperty({
    example: { ageGroup: '20s', travelStyle: 'relax' },
  })
  answers: Record<string, string>;

  @ApiProperty()
  completedAt: Date;
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

  @ApiProperty({ example: 8 })
  answeredCount: number;

  @ApiProperty({ example: 8 })
  totalQuestions: number;
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

  @ApiProperty({ example: '멤버 2명 · 후보 5곳' })
  summary: string;

  @ApiProperty({ example: 3 })
  currentStep: number;
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

  @ApiPropertyOptional({ type: PlaceDto })
  place?: PlaceDto;
}

export class ItineraryItemDto {
  @ApiProperty({ example: 'item-1' })
  id: string;

  @ApiPropertyOptional()
  placeId?: string;

  @ApiProperty({ example: '성산일출봉' })
  placeName: string;

  @ApiProperty({ example: '09:00' })
  startTime: string;

  @ApiProperty({ example: '11:00' })
  endTime: string;

  @ApiProperty({ example: ['자연'] })
  tags: string[];

  @ApiProperty({ example: '일출 명소' })
  reason: string;

  @ApiProperty({ example: 'must', enum: ['must', 'optional', 'skip'] })
  priority: string;

  @ApiProperty({ example: 1 })
  day: number;

  @ApiPropertyOptional({ example: 33.458 })
  lat?: number;

  @ApiPropertyOptional({ example: 126.942 })
  lng?: number;
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
}

export class MatchResultDto {
  @ApiProperty({ example: 78 })
  compatibilityScore: number;

  @ApiProperty({ example: ['카페', '자연'] })
  matchingAreas: string[];

  @ApiProperty({ example: ['쇼핑'] })
  adjustmentAreas: string[];

  @ApiProperty({ example: ['클럽'] })
  avoidAreas: string[];

  @ApiProperty({ example: '자연·카페에서 잘 맞아요' })
  summary: string;
}

export class CourseDto {
  @ApiProperty({ example: 'course-1' })
  id: string;

  @ApiProperty({ example: '감성 제주 코스' })
  title: string;

  @ApiProperty({ example: '카페·일출 중심' })
  subtitle: string;

  @ApiProperty({ example: ['성산일출봉', '카페'] })
  places: string[];

  @ApiProperty({ example: ['감성', '자연'] })
  tags: string[];

  @ApiProperty({ example: 85 })
  compatibilityScore: number;

  @ApiProperty({ example: true })
  isRecommended: boolean;
}

export class AdjustmentPlanDto {
  @ApiProperty({ example: '쇼핑은 반나절로 줄여보세요' })
  aiMessage: string;

  @ApiProperty({ example: ['공통 관심사 우선', '동선 최적화'] })
  summaryPoints: string[];
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

export class DuriSuggestPlacesDto {
  @ApiProperty({
    example: [{ name: '협재해수욕장', reason: '바다·감성 태그 매칭' }],
  })
  suggestions: { name: string; reason: string }[];
}

export class AnalysisReportDto {
  @ApiProperty()
  _id: string;

  @ApiProperty()
  roomId: string;

  @ApiProperty({
    example: {
      totalDistance: 42.5,
      segments: [{ from: '성산', to: '우도', km: 8 }],
      warnings: [],
    },
  })
  routeAnalysis: Record<string, unknown>;

  @ApiProperty({
    example: {
      estimated: 180000,
      breakdown: [{ place: '성산일출봉', estimated: 0 }],
    },
  })
  budgetAnalysis: Record<string, unknown>;

  @ApiProperty({
    example: { byDay: [{ day: 1, score: 70, message: '적정' }] },
  })
  densityAnalysis: Record<string, unknown>;

  @ApiProperty({
    example: { score: 80, details: [{ area: '자연', matched: true }] },
  })
  preferenceReflection: Record<string, unknown>;

  @ApiProperty({
    example: { overlaps: [], closedVenues: [] },
  })
  conflictAnalysis: Record<string, unknown>;

  @ApiProperty({
    example: [{ type: 'route', message: '동선을 줄여보세요' }],
  })
  suggestions: { type: string; message: string }[];
}
