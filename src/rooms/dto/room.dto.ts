import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoomDto {
  @ApiPropertyOptional({ example: '제주 여행' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;
}

export class UpdateRoomDto {
  @ApiPropertyOptional({ example: '제주 3박4일' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ example: '2026-07-10' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-07-13' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ['ongoing', 'completed'], example: 'ongoing' })
  @IsOptional()
  @IsEnum(['ongoing', 'completed'])
  status?: 'ongoing' | 'completed';
}

export class UpdateDestinationDto {
  @ApiProperty({ example: '제주' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'JEJU' })
  @IsOptional()
  @IsString()
  regionCode?: string;

  @ApiPropertyOptional({ example: 33.4996 })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 126.5312 })
  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class AddCandidateDto {
  @ApiPropertyOptional({
    example: '665abc123def456789012345',
    description: 'mongo placeId. tourContentId와 둘 중 하나 필수',
  })
  @IsOptional()
  @IsMongoId()
  placeId?: string;

  @ApiPropertyOptional({
    example: '126508',
    description: 'TourAPI contentId. 지정 시 백엔드가 upsert 후 후보로 추가',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/, { message: 'tourContentId must be numeric' })
  tourContentId?: string;

  @ApiPropertyOptional({
    example: 12,
    description: 'tourContentId와 함께 쓰는 콘텐츠 타입',
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn([12, 14, 15, 25, 28, 32, 38, 39])
  contentTypeId?: number;

  @ApiPropertyOptional({ example: '꼭 가고 싶어요' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateFromCompatibilityDto {
  @ApiProperty({
    example: ['665abc123def456789012346', '665abc123def456789012347'],
    description: '함께 여행할 멤버 userId 목록 (본인 제외 가능)',
  })
  @IsArray()
  @IsMongoId({ each: true })
  memberUserIds: string[];

  @ApiPropertyOptional({ example: '궁합 멤버 제주 여행' })
  @IsOptional()
  @IsString()
  title?: string;
}

export class ScheduleStyleDto {
  @ApiProperty({
    enum: ['jType', 'pType'],
    example: 'jType',
    description: 'jType: 계획형, pType: 유연형',
  })
  @IsEnum(['jType', 'pType'])
  style: 'jType' | 'pType';
}

export class SelectCourseDto {
  @ApiProperty({ example: 'course-1' })
  @IsString()
  courseId: string;
}

export class ReorderScheduleDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  day: number;

  @ApiProperty({
    example: ['item-3', 'item-1', 'item-2'],
    description:
      '해당 day의 모든 item id를 최종 순서대로 전달 (exact permutation 필수)',
  })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];

  @ApiProperty({
    example: 0,
    description: 'GET schedule의 scheduleVersion (필수)',
  })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({
    description: '재전송 중복 방지 키',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class ScheduleItemDto {
  @ApiPropertyOptional({ example: 'item-1' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: '665abc123def456789012345' })
  @IsOptional()
  @IsMongoId()
  placeId?: string;

  @ApiProperty({ example: '성산일출봉' })
  @IsString()
  placeName: string;

  @ApiProperty({
    example: '09:00',
    description: 'HH:mm 형식 (00:00–23:59), 분 단위 그대로 보존',
  })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime은 HH:mm 형식이어야 합니다',
  })
  @IsString()
  startTime: string;

  @ApiProperty({
    example: '11:00',
    description: 'HH:mm 형식 (00:00–23:59), startTime보다 이후',
  })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime은 HH:mm 형식이어야 합니다',
  })
  @IsString()
  endTime: string;

  @ApiPropertyOptional({ example: ['자연', '사진'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: '일출 보러 가기' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    enum: ['must', 'optional', 'skip'],
    example: 'must',
  })
  @IsOptional()
  @IsEnum(['must', 'optional', 'skip'])
  priority?: 'must' | 'optional' | 'skip';

  @ApiPropertyOptional({ example: 1, description: '1 이상 정수 (date 없을 때)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  day?: number;

  @ApiPropertyOptional({
    example: '2026-07-10',
    description: '기준 날짜 YYYY-MM-DD. 있으면 day는 서버가 파생',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ example: 33.458 })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 126.942 })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiProperty({
    example: 0,
    description: 'GET schedule의 scheduleVersion (필수)',
  })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ description: '재전송 중복 방지 키' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class UploadTicketDto {
  @ApiPropertyOptional({
    example: '사전 예매 QR',
    description: '입장권 메모 (multipart form field)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @ApiProperty({
    example: 0,
    description: 'scheduleVersion (multipart form field, 필수)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ description: '재전송 중복 방지 키' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class UpdateScheduleItemDto {
  @ApiPropertyOptional({ example: '성산일출봉' })
  @IsOptional()
  @IsString()
  placeName?: string;

  @ApiPropertyOptional({ example: '665abc123def456789012345' })
  @IsOptional()
  @IsMongoId()
  placeId?: string | null;

  @ApiPropertyOptional({ example: '09:30', description: 'HH:mm 형식' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime은 HH:mm 형식이어야 합니다',
  })
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '11:30', description: 'HH:mm 형식' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime은 HH:mm 형식이어야 합니다',
  })
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ example: '일출 보러 가기' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ enum: ['must', 'optional', 'skip'], example: 'optional' })
  @IsOptional()
  @IsEnum(['must', 'optional', 'skip'])
  priority?: 'must' | 'optional' | 'skip';

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  day?: number;

  @ApiPropertyOptional({ example: '2026-07-11' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ example: 33.458 })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 126.942 })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({
    example: true,
    description: '잠금 해제 후 수정할 때 true (잠긴 항목 변경용)',
  })
  @IsOptional()
  @IsBoolean()
  unlock?: boolean;

  @ApiProperty({
    example: 0,
    description: 'GET schedule의 scheduleVersion (필수)',
  })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ description: '재전송 중복 방지 키' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class LockScheduleItemDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  locked: boolean;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class UpsertReservationDto {
  @ApiPropertyOptional({
    enum: ['confirmed', 'unconfirmed', 'cancelled'],
    example: 'confirmed',
  })
  @IsOptional()
  @IsEnum(['confirmed', 'unconfirmed', 'cancelled'])
  status?: 'confirmed' | 'unconfirmed' | 'cancelled';

  @ApiPropertyOptional({ example: '2026-07-10' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiPropertyOptional({ example: '11:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @ApiPropertyOptional({ example: '08:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  timeWindowStart?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  timeWindowEnd?: string;

  @ApiPropertyOptional({ example: 'Asia/Seoul' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  placeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confirmationCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentTicketIds?: string[];

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class PlaceAnchorDto {
  @ApiProperty({ example: '제주 호텔' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 33.49 })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 126.53 })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  placeId?: string;

  @ApiPropertyOptional({ example: '126508' })
  @IsOptional()
  @IsString()
  externalId?: string;

  @ApiPropertyOptional({ enum: ['tour', 'kakao', 'manual'] })
  @IsOptional()
  @IsEnum(['tour', 'kakao', 'manual'])
  source?: 'tour' | 'kakao' | 'manual';
}

export class UpdatePlanningDto {
  @ApiPropertyOptional({ example: 'Asia/Seoul' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ type: PlaceAnchorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlaceAnchorDto)
  lodging?: PlaceAnchorDto | null;

  @ApiPropertyOptional({ type: PlaceAnchorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlaceAnchorDto)
  returnPoint?: PlaceAnchorDto | null;

  @ApiPropertyOptional({
    enum: ['car', 'transit', 'walk', 'mixed'],
    example: 'car',
  })
  @IsOptional()
  @IsEnum(['car', 'transit', 'walk', 'mixed'])
  transportMode?: 'car' | 'transit' | 'walk' | 'mixed';

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  returnDeadline?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  travelBufferMinutes?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  prepBufferMinutes?: number;

  @ApiPropertyOptional({
    example: true,
    description: '전달한 versioned 필드를 confirmedAt 갱신',
  })
  @IsOptional()
  confirm?: boolean;
}

export class ScheduleItemInputDto {
  @ApiPropertyOptional({ example: 'item-1' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ example: '665abc123def456789012345' })
  @IsOptional()
  @IsMongoId()
  placeId?: string;

  @ApiProperty({ example: '성산일출봉' })
  @IsString()
  placeName: string;

  @ApiProperty({ example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsString()
  startTime: string;

  @ApiProperty({ example: '11:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsString()
  endTime: string;

  @ApiPropertyOptional({ example: ['자연', '사진'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: '일출 보러 가기' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    enum: ['must', 'optional', 'skip'],
    example: 'must',
  })
  @IsOptional()
  @IsEnum(['must', 'optional', 'skip'])
  priority?: 'must' | 'optional' | 'skip';

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  day?: number;

  @ApiPropertyOptional({ example: '2026-07-10' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ example: 33.458 })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 126.942 })
  @IsOptional()
  @IsNumber()
  lng?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  locked?: boolean;
}

export class ScheduleDayDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  day: number;

  @ApiProperty({ type: [ScheduleItemInputDto] })
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemInputDto)
  items: ScheduleItemInputDto[];
}

export class BatchScheduleDto {
  @ApiProperty({
    type: [ScheduleDayDto],
    example: [
      {
        day: 1,
        items: [
          {
            id: 'item-1',
            placeName: '성산일출봉',
            startTime: '09:00',
            endTime: '11:00',
            tags: ['자연'],
            priority: 'must',
          },
        ],
      },
    ],
  })
  @ValidateNested({ each: true })
  @Type(() => ScheduleDayDto)
  days: ScheduleDayDto[];

  @ApiProperty({
    example: 0,
    description:
      '동시 수정 보호용 (필수). GET schedule의 scheduleVersion과 같아야 저장됩니다.',
  })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ description: '재전송 중복 방지 키' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class ReplacePlaceDto {
  @ApiProperty({ example: 'item-1' })
  @IsString()
  itemId: string;
}

export class OptimizeDto {
  @ApiPropertyOptional({ example: 150000, description: '예산 (원)' })
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  minimizeTravel?: boolean;
}

export class TripDateItemActionDto {
  @ApiProperty({ example: 'item-1' })
  @IsString()
  itemId: string;

  @ApiProperty({ enum: ['keep', 'move', 'delete'], example: 'move' })
  @IsEnum(['keep', 'move', 'delete'])
  action: 'keep' | 'move' | 'delete';

  @ApiPropertyOptional({ example: '2026-07-12' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  day?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  unlock?: boolean;
}

export class UpdateTripDatesDto {
  @ApiProperty({ example: '2026-07-10' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-07-13' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({ type: [TripDateItemActionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripDateItemActionDto)
  itemActions?: TripDateItemActionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class ApplyScheduleProposalDto {
  @ApiProperty({ type: [ScheduleDayDto] })
  @ValidateNested({ each: true })
  @Type(() => ScheduleDayDto)
  days: ScheduleDayDto[];

  @ApiProperty({
    example: 0,
    description: '현재 scheduleVersion (필수)',
  })
  @IsInt()
  @Min(0)
  expectedVersion: number;

  @ApiPropertyOptional({
    example: 0,
    description: '분석 시점 factsVersion. 바뀌었으면 409',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedFactsVersion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMutationId?: string;
}

export class UpsertCandidateSignalDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  mustVisit?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  avoid?: boolean;

  @ApiPropertyOptional({
    example: 4,
    description: '1–5. 미전달=미응답(0으로 채우지 않음)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  preferenceStrength?: number;
}
