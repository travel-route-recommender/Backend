import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { TOUR_CONTENT_TYPE_IDS } from '../tour.util';

const CONTENT_TYPE_VALUES = [...TOUR_CONTENT_TYPE_IDS];

export class ListPlacesQueryDto {
  @ApiPropertyOptional({ example: '39', description: '지역코드 (areaCode)' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional({ example: '4', description: '시군구코드' })
  @IsOptional()
  @IsString()
  sigunguCode?: string;

  @ApiPropertyOptional({ enum: CONTENT_TYPE_VALUES, example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(CONTENT_TYPE_VALUES)
  contentTypeId?: number;

  @ApiPropertyOptional({
    example: 'O',
    description: 'A:제목 C:수정일 O:이미지+제목 Q:이미지+수정일',
  })
  @IsOptional()
  @IsString()
  arrange?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

export class SearchPlacesQueryDto {
  @ApiProperty({ example: '성산일출봉', description: '검색 키워드' })
  @IsString()
  keyword: string;

  @ApiPropertyOptional({ example: '39' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional({ example: '4' })
  @IsOptional()
  @IsString()
  sigunguCode?: string;

  @ApiPropertyOptional({ enum: CONTENT_TYPE_VALUES, example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(CONTENT_TYPE_VALUES)
  contentTypeId?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

export class NearbyPlacesQueryDto {
  @ApiProperty({ example: 126.942, description: '경도 (mapX)' })
  @Type(() => Number)
  @IsNumber()
  mapX: number;

  @ApiProperty({ example: 33.458, description: '위도 (mapY)' })
  @Type(() => Number)
  @IsNumber()
  mapY: number;

  @ApiPropertyOptional({ example: 2000, default: 2000, description: '반경(m), 최대 20000' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  radius?: number;

  @ApiPropertyOptional({ enum: CONTENT_TYPE_VALUES, example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(CONTENT_TYPE_VALUES)
  contentTypeId?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

export class PlaceDetailQueryDto {
  @ApiPropertyOptional({ enum: CONTENT_TYPE_VALUES, example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(CONTENT_TYPE_VALUES)
  contentTypeId?: number;
}
