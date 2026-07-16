import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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

  @ApiPropertyOptional({
    enum: CONTENT_TYPE_VALUES,
    example: 12,
    description:
      '12관광지 · 14문화 · 15축제 · 25코스 · 28레포츠 · 32숙박 · 38쇼핑 · 39음식',
  })
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

  @ApiPropertyOptional({ example: '39', description: '지역코드 (예: 39=제주)' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional({ example: '4', description: '시군구코드' })
  @IsOptional()
  @IsString()
  sigunguCode?: string;

  @ApiPropertyOptional({
    enum: CONTENT_TYPE_VALUES,
    example: 12,
    description:
      '12관광지 · 14문화 · 15축제 · 25코스 · 28레포츠 · 32숙박 · 38쇼핑 · 39음식',
  })
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

export class FestivalQueryDto {
  @ApiPropertyOptional({
    example: '20260101',
    description: '행사 시작일 YYYYMMDD (미지정 시 오늘)',
  })
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'eventStartDate must be YYYYMMDD' })
  eventStartDate?: string;

  @ApiPropertyOptional({ example: '20261231', description: '행사 종료일 YYYYMMDD' })
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'eventEndDate must be YYYYMMDD' })
  eventEndDate?: string;

  @ApiPropertyOptional({ example: '39' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional({ example: '4' })
  @IsOptional()
  @IsString()
  sigunguCode?: string;

  @ApiPropertyOptional({ example: 'O' })
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

export class StayQueryDto {
  @ApiPropertyOptional({ example: '39' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional({ example: '4' })
  @IsOptional()
  @IsString()
  sigunguCode?: string;

  @ApiPropertyOptional({ example: 'O' })
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

export class SyncQueryDto {
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

  @ApiPropertyOptional({
    example: '20260101000000',
    description: '이 시각 이후 수정분만 (YYYYMMDDHHMMSS)',
  })
  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'modifiedtime must be YYYYMMDDHHMMSS' })
  modifiedtime?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  size?: number;
}

export class LdongCodeQueryDto {
  @ApiPropertyOptional({
    example: '11',
    description: '법정동 시도코드 (미지정 시 시도 목록)',
  })
  @IsOptional()
  @IsString()
  lDongRegnCd?: string;

  @ApiPropertyOptional({ example: '110', description: '법정동 시군구코드' })
  @IsOptional()
  @IsString()
  lDongSignguCd?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  size?: number;
}

export class CategoryCodeQueryDto {
  @ApiPropertyOptional({ example: 'AC', description: '분류체계 대분류 코드' })
  @IsOptional()
  @IsString()
  lclsSystm1?: string;

  @ApiPropertyOptional({ example: 'AC01', description: '분류체계 중분류 코드' })
  @IsOptional()
  @IsString()
  lclsSystm2?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  size?: number;
}

export class RegionHighlightsQueryDto {
  @ApiProperty({
    example: '1110',
    description:
      '시군구 코드 (특화 API 체계). KorService2 sigungucode와 다를 수 있음',
  })
  @IsString()
  signguCd: string;

  @ApiPropertyOptional({
    example: '202504',
    description: '기준 연월 YYYYMM (미지정 시 직전 월)',
  })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'baseYm must be YYYYMM' })
  baseYm?: string;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;
}

export class VisitorsQueryDto {
  @ApiProperty({
    enum: ['metro', 'local'],
    example: 'metro',
    description: 'metro=광역(metco) · local=기초(locgo)',
  })
  @IsIn(['metro', 'local'])
  level: 'metro' | 'local';

  @ApiProperty({ example: '20250401', description: '시작일 YYYYMMDD' })
  @Matches(/^\d{8}$/, { message: 'startYmd must be YYYYMMDD' })
  startYmd: string;

  @ApiProperty({ example: '20250407', description: '종료일 YYYYMMDD' })
  @Matches(/^\d{8}$/, { message: 'endYmd must be YYYYMMDD' })
  endYmd: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 100, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  size?: number;
}

export class CongestionQueryDto {
  @ApiPropertyOptional({
    example: '1',
    description: '특화 API areaCd. 미지정 시 KorService2 areacode 사용',
  })
  @IsOptional()
  @IsString()
  areaCd?: string;

  @ApiPropertyOptional({
    example: '1110',
    description: '특화 API signguCd. 미지정 시 KorService2 sigungucode 사용',
  })
  @IsOptional()
  @IsString()
  signguCd?: string;
}
