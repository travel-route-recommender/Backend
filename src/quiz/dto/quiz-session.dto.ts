import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScheduleSlotDraftDto {
  @ApiProperty({ example: 540, description: '하루 시작 기준 분 (09:00 = 540)' })
  @IsInt()
  startMinutes: number;

  @ApiProperty({ example: 660 })
  @IsInt()
  endMinutes: number;

  @ApiProperty({ enum: ['PLACE', 'REST', 'FREE'] })
  @IsIn(['PLACE', 'REST', 'FREE'])
  kind: 'PLACE' | 'REST' | 'FREE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeName?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  landmarkScore?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  localScore?: number;
}

export class ScheduleFeaturesDto {
  @ApiProperty() @IsNumber() scheduleSpanMinutes: number;
  @ApiProperty() @IsNumber() scheduledMinutes: number;
  @ApiProperty() @IsNumber() activityMinutes: number;
  @ApiProperty() @IsNumber() restMinutes: number;
  @ApiProperty() @IsNumber() freeTimeMinutes: number;
  @ApiProperty() @IsNumber() placeCount: number;
  @ApiProperty() @IsNumber() restBlockCount: number;
  @ApiProperty() @IsNumber() averageStayMinutes: number;
}

export class PlaceFeaturesDto {
  @ApiProperty() @IsNumber() selectedPlaceCount: number;
  @ApiProperty() @IsNumber() selectedLandmarkCount: number;
  @ApiProperty() @IsNumber() selectedLocalPlaceCount: number;
  @ApiProperty() @IsNumber() averageLandmarkScore: number;
  @ApiProperty() @IsNumber() averageLocalScore: number;
  @ApiProperty() @IsNumber() landmarkAllocatedMinutes: number;
  @ApiProperty() @IsNumber() localAllocatedMinutes: number;
}

export class TransportPreferencesDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  CAR?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  PUBLIC_TRANSIT?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  WALKING?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  TAXI?: number;
}

export class AccommodationPreferenceDto {
  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  stayImportance: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  facilityOverLocation: number;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  comfortOverPrice: number;
}

export class SpendingAllocationDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  totalCoins: number;

  @ApiProperty({
    example: {
      ACCOMMODATION: 20,
      FOOD: 30,
      TRANSPORT: 10,
      TOURISM: 10,
      ACTIVITY: 20,
      SHOPPING: 5,
      CAFE_REST: 5,
    },
  })
  @IsObject()
  allocation: Record<string, number>;
}

export class QuizResponsesDto {
  @ApiPropertyOptional({ type: [ScheduleSlotDraftDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDraftDto)
  scheduleDraft?: ScheduleSlotDraftDto[];

  @ApiPropertyOptional({ type: ScheduleFeaturesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleFeaturesDto)
  scheduleFeatures?: ScheduleFeaturesDto;

  @ApiPropertyOptional({ type: PlaceFeaturesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlaceFeaturesDto)
  placeFeatures?: PlaceFeaturesDto;

  @ApiPropertyOptional({ type: TransportPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TransportPreferencesDto)
  transportPreferences?: TransportPreferencesDto;

  @ApiPropertyOptional({ type: AccommodationPreferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AccommodationPreferenceDto)
  accommodationPreference?: AccommodationPreferenceDto;

  @ApiPropertyOptional({ enum: ['LESS_VALIDATED', 'VALIDATED'] })
  @IsOptional()
  @IsIn(['LESS_VALIDATED', 'VALIDATED'])
  placeValidationPreference?: 'LESS_VALIDATED' | 'VALIDATED';

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  challenging?: number;

  @ApiPropertyOptional({ enum: ['LOW', 'NORMAL', 'HIGH'] })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH'])
  staminaLevel?: 'LOW' | 'NORMAL' | 'HIGH';

  @ApiPropertyOptional({ type: SpendingAllocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SpendingAllocationDto)
  spendingAllocation?: SpendingAllocationDto;
}

export class PatchQuizSessionDto {
  @ApiProperty({ type: QuizResponsesDto })
  @ValidateNested()
  @Type(() => QuizResponsesDto)
  responses: QuizResponsesDto;
}

export class CompleteQuizSessionDto {
  @ApiPropertyOptional({ type: QuizResponsesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuizResponsesDto)
  responses?: QuizResponsesDto;
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
