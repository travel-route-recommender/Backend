import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class SubmitOnboardingSurveyDto {
  @ApiPropertyOptional({ description: '레거시 자유 형식 응답' })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasLicense?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  hasCar?: boolean;

  @ApiPropertyOptional({
    enum: ['STAIRS', 'STEEP_SLOPE', 'LONG_WALK'],
    isArray: true,
    example: ['STAIRS', 'LONG_WALK'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['STAIRS', 'STEEP_SLOPE', 'LONG_WALK'], { each: true })
  mobilityConstraints?: Array<'STAIRS' | 'STEEP_SLOPE' | 'LONG_WALK'>;

  @ApiPropertyOptional({ example: 2003 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear())
  birthYear?: number;

  @ApiPropertyOptional({ example: 23 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  age?: number;

  @ApiPropertyOptional({ example: ['카페', '바다', '맛집'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
