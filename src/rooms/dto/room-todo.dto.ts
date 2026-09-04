import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class TodoChecklistItemDto {
  @ApiPropertyOptional({ example: 'chk-1' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: '입장권 캡처 확인' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class TodoLinkDto {
  @ApiProperty({
    enum: ['scheduleItem', 'reservation', 'ticket', 'document'],
  })
  @IsEnum(['scheduleItem', 'reservation', 'ticket', 'document'])
  type: 'scheduleItem' | 'reservation' | 'ticket' | 'document';

  @ApiProperty({ example: 'item-1' })
  @IsString()
  targetId: string;

  @ApiPropertyOptional({ example: 'item-1' })
  @IsOptional()
  @IsString()
  scheduleItemId?: string;
}

export class TodoSourceDto {
  @ApiPropertyOptional({
    enum: ['manual', 'duriAnalysis', 'ocrConfirm', 'scheduleChange'],
  })
  @IsOptional()
  @IsEnum(['manual', 'duriAnalysis', 'ocrConfirm', 'scheduleChange'])
  kind?: 'manual' | 'duriAnalysis' | 'ocrConfirm' | 'scheduleChange';

  @ApiPropertyOptional({
    description: 'room+cause+baseRevision 범위의 안정적 중복 방지 키',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: 'dedupeKey는 공백일 수 없습니다.' })
  @MaxLength(200)
  dedupeKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cause?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  baseRevision?: string;
}

export class CreateRoomTodoDto {
  @ApiProperty({ example: '성산일출봉 예약 확인' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ['open', 'in_progress', 'done', 'cancelled'] })
  @IsOptional()
  @IsEnum(['open', 'in_progress', 'done', 'cancelled'])
  status?: 'open' | 'in_progress' | 'done' | 'cancelled';

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'urgent'] })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @ApiPropertyOptional({ example: '2026-07-10' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dueTime?: string;

  @ApiPropertyOptional({ example: 'Asia/Seoul' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  assigneeId?: string;

  @ApiPropertyOptional({ type: [TodoChecklistItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TodoChecklistItemDto)
  checklist?: TodoChecklistItemDto[];

  @ApiPropertyOptional({ type: [TodoLinkDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TodoLinkDto)
  links?: TodoLinkDto[];

  @ApiPropertyOptional({ type: TodoSourceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TodoSourceDto)
  source?: TodoSourceDto;

  @ApiPropertyOptional({ description: '재전송 중복 방지' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: 'clientMutationId는 공백일 수 없습니다.' })
  @MaxLength(100)
  clientMutationId?: string;
}

export class UpdateRoomTodoDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ['open', 'in_progress', 'done', 'cancelled'] })
  @IsOptional()
  @IsEnum(['open', 'in_progress', 'done', 'cancelled'])
  status?: 'open' | 'in_progress' | 'done' | 'cancelled';

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'urgent'] })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: 'low' | 'medium' | 'high' | 'urgent';

  @ApiPropertyOptional({ example: '2026-07-10', nullable: true })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate?: string | null;

  @ApiPropertyOptional({ example: '18:00', nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dueTime?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsMongoId()
  assigneeId?: string | null;

  @ApiPropertyOptional({ type: [TodoChecklistItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TodoChecklistItemDto)
  checklist?: TodoChecklistItemDto[];

  @ApiPropertyOptional({ type: [TodoLinkDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TodoLinkDto)
  links?: TodoLinkDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiProperty({
    example: 1,
    description: '현재 항목 revision (필수). 충돌 시 409',
  })
  @IsInt()
  @Min(1)
  expectedRevision: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: 'clientMutationId는 공백일 수 없습니다.' })
  @MaxLength(100)
  clientMutationId?: string;
}

export class ResolveAutoTodosDto {
  @ApiProperty({
    example: 'duri:closed-venue:item-1:v3',
    description: '해소된 원인의 dedupeKey',
  })
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: 'dedupeKey는 공백일 수 없습니다.' })
  dedupeKey: string;

  @ApiPropertyOptional({
    description:
      '원인을 해소한 일정 버전. 서버 후속 작업의 순서 역전을 막을 때 사용합니다.',
    example: 7,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedScheduleVersion?: number;
}
