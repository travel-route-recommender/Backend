import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const CHALLENGE_TYPES = [
  'challenge_executor',
  'cautious_explorer',
  'stable_planner',
] as const;

const SCHEDULE_TYPES = ['packed', 'relaxed'] as const;

type Sentiment = 'like' | 'neutral' | 'dislike';

const BUDGET_ITEMS = [
  'stay',
  'food',
  'activity',
  'shopping',
  'mobility',
] as const;

const STAMINA_ANSWERS = ['low', 'medium', 'high'] as const;
const STAMINA_LEVELS = ['LOW', 'NORMAL', 'HIGH'] as const;

export class ChallengeStyleScoresDto {
  @ApiProperty({ example: 75 })
  @IsNumber()
  @Min(0)
  @Max(100)
  opennessToVariety: number;

  @ApiProperty({ example: 88 })
  @IsNumber()
  @Min(0)
  @Max(100)
  excitementSeeking: number;

  @ApiProperty({ example: 63 })
  @IsNumber()
  @Min(0)
  @Max(100)
  cautiousness: number;

  @ApiProperty({ example: 81 })
  @IsNumber()
  @Min(0)
  @Max(100)
  exploration: number;
}

export class ScheduleStyleComponentsDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  density: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  activeRestPreference: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  stamina: number;
}

export class QuizScheduleStyleDto {
  @ApiProperty({ enum: SCHEDULE_TYPES, example: 'packed' })
  @IsIn(SCHEDULE_TYPES)
  type: (typeof SCHEDULE_TYPES)[number];

  @ApiProperty({ example: 75 })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;

  @ApiProperty({ type: ScheduleStyleComponentsDto })
  @ValidateNested()
  @Type(() => ScheduleStyleComponentsDto)
  components: ScheduleStyleComponentsDto;
}

export class ItineraryCategoryScoresDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  restaurant: number;
  @ApiProperty({ example: 50 }) @IsNumber() @Min(0) @Max(100) cafe: number;
  @ApiProperty({ example: 0 }) @IsNumber() @Min(0) @Max(100) shopping: number;
  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  attraction: number;
  @ApiProperty({ example: 100 }) @IsNumber() @Min(0) @Max(100) local: number;
  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  experience: number;
  @ApiProperty({ example: 100 }) @IsNumber() @Min(0) @Max(100) nature: number;
  @ApiProperty({ example: 50 }) @IsNumber() @Min(0) @Max(100) rest: number;
}

export class ItineraryPreferenceDto {
  @ApiProperty({ type: ItineraryCategoryScoresDto })
  @ValidateNested()
  @Type(() => ItineraryCategoryScoresDto)
  categoryScores: ItineraryCategoryScoresDto;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  densityScore: number;
}

export class ChallengeStyleChapterDto {
  @ApiProperty({
    example: { i18: 4, i48: 2, i22: 5, i52: 4, i90: 2, i120: 3 },
    description: '도전·안정 6문항 원본 (문항ID → 1~5)',
  })
  @IsObject()
  challengeStyleAnswers: Record<string, number>;

  @ApiProperty({
    example: {
      restaurant: 'like',
      cafe: 'neutral',
      shopping: 'dislike',
      attraction: 'like',
      local: 'like',
      experience: 'neutral',
      nature: 'like',
      rest: 'neutral',
      density: 'like',
    },
    description: '활동 종류·일정 밀도 9문항 원본',
  })
  @IsObject()
  itineraryMessageAnswers: Record<string, Sentiment>;

  @ApiProperty({ enum: CHALLENGE_TYPES, example: 'cautious_explorer' })
  @IsIn(CHALLENGE_TYPES)
  type: (typeof CHALLENGE_TYPES)[number];

  @ApiProperty({ type: ChallengeStyleScoresDto })
  @ValidateNested()
  @Type(() => ChallengeStyleScoresDto)
  scores: ChallengeStyleScoresDto;

  @ApiProperty({ type: QuizScheduleStyleDto })
  @ValidateNested()
  @Type(() => QuizScheduleStyleDto)
  scheduleStyle: QuizScheduleStyleDto;

  @ApiProperty({ type: ItineraryPreferenceDto })
  @ValidateNested()
  @Type(() => ItineraryPreferenceDto)
  itineraryPreference: ItineraryPreferenceDto;
}

export class AccommodationAnswersDto {
  @ApiProperty({ example: 6, description: '1–8' })
  @IsInt()
  @Min(1)
  @Max(8)
  stayMeaning: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(8)
  locationFacility: number;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(8)
  comfortPrice: number;
}

export class AccommodationScoresDto {
  @ApiProperty({ example: 71 })
  @IsNumber()
  @Min(0)
  @Max(100)
  stayImportance: number;

  @ApiProperty({ example: 43 })
  @IsNumber()
  @Min(0)
  @Max(100)
  facilityOverLocation: number;

  @ApiProperty({ example: 71 })
  @IsNumber()
  @Min(0)
  @Max(100)
  comfortOverPrice: number;
}

export class AccommodationChapterDto {
  @ApiProperty({ type: AccommodationAnswersDto })
  @ValidateNested()
  @Type(() => AccommodationAnswersDto)
  answers: AccommodationAnswersDto;

  @ApiProperty({ type: AccommodationScoresDto })
  @ValidateNested()
  @Type(() => AccommodationScoresDto)
  scores: AccommodationScoresDto;
}

export class StaminaChapterDto {
  @ApiProperty({ enum: STAMINA_ANSWERS, example: 'medium' })
  @IsIn(STAMINA_ANSWERS)
  answer: (typeof STAMINA_ANSWERS)[number];

  @ApiProperty({ enum: STAMINA_LEVELS, example: 'NORMAL' })
  @IsIn(STAMINA_LEVELS)
  level: (typeof STAMINA_LEVELS)[number];

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;
}

export class BudgetChapterDto {
  @ApiProperty({
    example: ['food', 'stay', 'activity', 'shopping', 'mobility'],
    description:
      '5개 항목 중복 없이 순위. stay/food/activity/shopping/mobility',
  })
  @IsArray()
  @ArrayMinSize(5)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsIn(BUDGET_ITEMS, { each: true })
  ranking: Array<(typeof BUDGET_ITEMS)[number]>;
}

export class DiscoveryAnswersDto {
  @ApiProperty({ example: 3, description: '1–4' })
  @IsInt()
  @Min(1)
  @Max(4)
  landmarkImportance: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  localInterest: number;
}

export class DiscoveryScoresDto {
  @ApiProperty({ example: 67 })
  @IsNumber()
  @Min(0)
  @Max(100)
  landmarkImportance: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  localInterest: number;
}

export class DiscoveryChapterDto {
  @ApiProperty({ type: DiscoveryAnswersDto })
  @ValidateNested()
  @Type(() => DiscoveryAnswersDto)
  answers: DiscoveryAnswersDto;

  @ApiProperty({ type: DiscoveryScoresDto })
  @ValidateNested()
  @Type(() => DiscoveryScoresDto)
  scores: DiscoveryScoresDto;
}

export class QuizResponsesDto {
  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(1)
  surveyVersion: number;

  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(1)
  algorithmVersion: number;

  @ApiProperty({ type: ChallengeStyleChapterDto })
  @ValidateNested()
  @Type(() => ChallengeStyleChapterDto)
  challengeStyle: ChallengeStyleChapterDto;

  @ApiProperty({ type: AccommodationChapterDto })
  @ValidateNested()
  @Type(() => AccommodationChapterDto)
  accommodation: AccommodationChapterDto;

  @ApiProperty({ type: StaminaChapterDto })
  @ValidateNested()
  @Type(() => StaminaChapterDto)
  stamina: StaminaChapterDto;

  @ApiProperty({ type: BudgetChapterDto })
  @ValidateNested()
  @Type(() => BudgetChapterDto)
  budget: BudgetChapterDto;

  @ApiProperty({ type: DiscoveryChapterDto })
  @ValidateNested()
  @Type(() => DiscoveryChapterDto)
  discovery: DiscoveryChapterDto;
}

/** PATCH 중간 저장 — 챕터별 partial 허용 */
export class PartialQuizResponsesDto {
  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @IsInt()
  @Min(1)
  surveyVersion?: number;

  @ApiPropertyOptional({ example: 9 })
  @IsOptional()
  @IsInt()
  @Min(1)
  algorithmVersion?: number;

  @ApiPropertyOptional({ type: ChallengeStyleChapterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChallengeStyleChapterDto)
  challengeStyle?: ChallengeStyleChapterDto;

  @ApiPropertyOptional({ type: AccommodationChapterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccommodationChapterDto)
  accommodation?: AccommodationChapterDto;

  @ApiPropertyOptional({ type: StaminaChapterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StaminaChapterDto)
  stamina?: StaminaChapterDto;

  @ApiPropertyOptional({ type: BudgetChapterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BudgetChapterDto)
  budget?: BudgetChapterDto;

  @ApiPropertyOptional({ type: DiscoveryChapterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DiscoveryChapterDto)
  discovery?: DiscoveryChapterDto;
}

export class PatchQuizSessionDto {
  @ApiProperty({ type: PartialQuizResponsesDto })
  @ValidateNested()
  @Type(() => PartialQuizResponsesDto)
  responses: PartialQuizResponsesDto;
}

export class CompleteQuizSessionDto {
  @ApiProperty({
    type: QuizResponsesDto,
    description: '전체 챕터 응답. FE가 점수까지 계산해서 보냄.',
  })
  @ValidateNested()
  @Type(() => QuizResponsesDto)
  responses: QuizResponsesDto;
}

/** @deprecated 레거시 한 방 제출 */
export class SubmitQuizDto {
  @ApiProperty({
    description: '레거시 문항 ID → 선택지 ID. 신규는 /quiz/sessions 사용.',
    example: { q1: 'q1_a' },
  })
  @IsObject()
  answers: Record<string, string>;
}
