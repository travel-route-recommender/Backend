import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
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
    description: '해당 day의 item id 순서',
  })
  @IsArray()
  @IsString({ each: true })
  itemIds: string[];
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

  @ApiProperty({ example: '09:00', description: 'HH:mm 형식' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '11:00', description: 'HH:mm 형식' })
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
  @IsNumber()
  day?: number;

  @ApiPropertyOptional({ example: 33.458 })
  @IsOptional()
  @IsNumber()
  lat?: number;

  @ApiPropertyOptional({ example: 126.942 })
  @IsOptional()
  @IsNumber()
  lng?: number;
}

export class UpdateScheduleItemDto {
  @ApiPropertyOptional({ example: '성산일출봉' })
  @IsOptional()
  @IsString()
  placeName?: string;

  @ApiPropertyOptional({ example: '09:30', description: 'HH:mm 형식' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '11:30', description: 'HH:mm 형식' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ enum: ['must', 'optional', 'skip'], example: 'optional' })
  @IsOptional()
  @IsEnum(['must', 'optional', 'skip'])
  priority?: 'must' | 'optional' | 'skip';

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  day?: number;
}

export class ScheduleDayDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  day: number;

  @ApiProperty({ type: [ScheduleItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ScheduleItemDto)
  items: ScheduleItemDto[];
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
