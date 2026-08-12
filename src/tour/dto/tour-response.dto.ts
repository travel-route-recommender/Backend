import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommonPlaceDto } from '../../common/dto/swagger-responses.dto';

/** 목록/검색 공통 페이지 메타 */
export class TourPageMetaDto {
  @ApiProperty({ example: 356, description: '전체 건수' })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  size: number;
}

/**
 * 관광지 카드 = CommonPlace (source: tour).
 * 후보 추가: placeId 있으면 placeId, 없으면 externalId를 tourContentId로.
 */
export class TourPlaceCardDto extends CommonPlaceDto {}

export class TourPlacePageDto {
  @ApiProperty({ type: [TourPlaceCardDto] })
  data: TourPlaceCardDto[];

  @ApiProperty({ type: TourPageMetaDto })
  meta: TourPageMetaDto;
}

export class TourPlaceImageDto {
  @ApiProperty({ example: 'http://tong.visitkorea.or.kr/.../image.jpg' })
  url: string;

  @ApiPropertyOptional({ example: 'http://tong.visitkorea.or.kr/.../thumb.jpg' })
  thumbnailUrl?: string;

  @ApiPropertyOptional({ example: '성산일출봉 전경' })
  name?: string;
}

/** 관광지 상세 = CommonPlace + Tour 전용 확장 */
export class TourPlaceDetailDto extends TourPlaceCardDto {
  @ApiProperty({
    type: [TourPlaceImageDto],
    description: '원본 갤러리(메타 포함). images[]는 URL만',
  })
  gallery: TourPlaceImageDto[];

  @ApiProperty({
    example: '성산일출봉은 제주 동쪽에 위치한 화산 분화구로...',
    nullable: true,
    description: 'description과 동일 (하위호환)',
  })
  overview: string | null;

  @ApiProperty({
    example: '39',
    nullable: true,
    description: 'KorService2 areacode (특화 API areaCd 매핑용)',
  })
  areaCode: string | null;

  @ApiProperty({
    example: '3',
    nullable: true,
    description: 'KorService2 sigungucode',
  })
  sigunguCode: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'detailIntro2 원본 필드 (유형별 상이)',
  })
  intro: Record<string, unknown>;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description: 'detailInfo2 반복정보',
  })
  repeatingInfo: Record<string, unknown>[];
}

export class TourFestivalCardDto extends TourPlaceCardDto {
  @ApiProperty({ example: '20260505', nullable: true })
  eventStartDate: string | null;

  @ApiProperty({ example: '20260505', nullable: true })
  eventEndDate: string | null;
}

export class TourFestivalPageDto {
  @ApiProperty({ type: [TourFestivalCardDto] })
  data: TourFestivalCardDto[];

  @ApiProperty({ type: TourPageMetaDto })
  meta: TourPageMetaDto;
}

export class TourSyncCardDto extends TourPlaceCardDto {
  @ApiProperty({ example: '1', nullable: true, description: '노출 여부 플래그' })
  showFlag: string | null;

  @ApiProperty({
    example: '20260616110400',
    nullable: true,
    description: '수정시각 YYYYMMDDHHMMSS',
  })
  modifiedTime: string | null;
}

export class TourSyncPageDto {
  @ApiProperty({ type: [TourSyncCardDto] })
  data: TourSyncCardDto[];

  @ApiProperty({ type: TourPageMetaDto })
  meta: TourPageMetaDto;
}

export class TourPetInfoDto {
  @ApiProperty({ example: '1019041' })
  contentId: string;

  @ApiProperty({ example: '전구역 동반가능', nullable: true })
  acmpyType: string | null;

  @ApiProperty({ example: '전 견종 동반 가능', nullable: true })
  acmpyAnimal: string | null;

  @ApiProperty({ example: '목줄 착용', nullable: true })
  needMaterial: string | null;

  @ApiProperty({
    example: '- 맹견의 경우, 입마개 착용 필수',
    nullable: true,
  })
  etcInfo: string | null;

  @ApiProperty({ nullable: true })
  facility: string | null;

  @ApiProperty({ nullable: true })
  furnishedItems: string | null;

  @ApiProperty({ nullable: true })
  rentalItems: string | null;

  @ApiProperty({ nullable: true })
  purchaseItems: string | null;

  @ApiProperty({ nullable: true })
  accidentRisk: string | null;
}

export class TourRelatedPlaceDto {
  @ApiProperty({ example: '창덕궁' })
  name: string;

  @ApiProperty({ example: 1, description: '연계 순위 (낮을수록 강함)' })
  rank: number;

  @ApiProperty({ example: '인문(문화/예술/역사)', nullable: true })
  categoryLarge: string | null;

  @ApiProperty({ example: '문화유적', nullable: true })
  categoryMedium: string | null;

  @ApiProperty({ example: '고궁', nullable: true })
  categorySmall: string | null;

  @ApiProperty({ example: '서울', nullable: true })
  areaName: string | null;

  @ApiProperty({ example: '종로구', nullable: true })
  sigunguName: string | null;

  @ApiProperty({ example: 'A0101002', nullable: true })
  tatsCode: string | null;

  @ApiProperty({
    example: 'RELATED_API',
    enum: ['RELATED_API', 'NEARBY_FALLBACK'],
  })
  source: 'RELATED_API' | 'NEARBY_FALLBACK';

  @ApiPropertyOptional({
    example: 'tour:126508',
    description: 'CommonPlace id (fallback 시)',
  })
  id?: string;

  @ApiPropertyOptional({ example: '126508', description: 'Tour contentId' })
  externalId?: string;

  @ApiPropertyOptional({ example: 12 })
  contentTypeId?: number;

  @ApiPropertyOptional({ example: 33.45, nullable: true })
  lat?: number | null;

  @ApiPropertyOptional({ example: 126.94, nullable: true })
  lng?: number | null;

  @ApiPropertyOptional({ example: 6.04, description: 'fallback 시 거리(m)' })
  distanceMeters?: number;
}

export class TourSimilarMetaDto extends TourPageMetaDto {
  @ApiProperty({
    example: 'RELATED_API',
    enum: ['RELATED_API', 'NEARBY_FALLBACK'],
  })
  source: string;
}

export class TourSimilarPageDto {
  @ApiProperty({ type: [TourRelatedPlaceDto] })
  data: TourRelatedPlaceDto[];

  @ApiProperty({ type: TourSimilarMetaDto })
  meta: TourSimilarMetaDto;
}

export class TourHubPlaceDto {
  @ApiProperty({ example: '경복궁' })
  name: string;

  @ApiProperty({ example: 1 })
  rank: number;

  @ApiProperty({ example: '인문(문화/예술/역사)', nullable: true })
  categoryLarge: string | null;

  @ApiProperty({ example: '문화유적', nullable: true })
  categoryMedium: string | null;

  @ApiProperty({ example: '서울', nullable: true })
  areaName: string | null;

  @ApiProperty({ example: '종로구', nullable: true })
  sigunguName: string | null;

  @ApiProperty({ example: 'A0101001', nullable: true })
  tatsCode: string | null;

  @ApiProperty({ example: 37.579617, nullable: true })
  lat: number | null;

  @ApiProperty({ example: 126.977041, nullable: true })
  lng: number | null;

  @ApiProperty({ example: '202504', nullable: true })
  baseYm: string | null;
}

export class TourHubPageDto {
  @ApiProperty({ type: [TourHubPlaceDto] })
  data: TourHubPlaceDto[];

  @ApiProperty({
    example: { total: 20, baseYm: '202504' },
  })
  meta: { total: number; baseYm: string };
}

export class TourVisitorStatDto {
  @ApiProperty({ example: '20250401' })
  date: string;

  @ApiProperty({ example: '11', nullable: true })
  areaCode?: string | null;

  @ApiProperty({ example: '서울특별시', nullable: true })
  areaName?: string | null;

  @ApiProperty({ example: '11110', nullable: true })
  sigunguCode?: string | null;

  @ApiProperty({ example: '서울 종로구', nullable: true })
  sigunguName?: string | null;

  @ApiProperty({ example: '월요일', nullable: true })
  dayOfWeek: string | null;

  @ApiProperty({
    example: 'domestic',
    enum: ['domestic', 'foreign', 'other', 'unknown'],
  })
  visitorType: string;

  @ApiProperty({ example: '1', nullable: true })
  visitorTypeCode: string | null;

  @ApiProperty({ example: '현지인', nullable: true })
  visitorTypeLabel: string | null;

  @ApiProperty({ example: 4691911 })
  count: number;
}

export class TourVisitorsPageDto {
  @ApiProperty({ type: [TourVisitorStatDto] })
  data: TourVisitorStatDto[];

  @ApiProperty({
    example: { total: 357, page: 1, size: 100, level: 'metro' },
  })
  meta: { total: number; page: number; size: number; level: string };
}

export class TourCongestionDayDto {
  @ApiProperty({ example: '20260701' })
  date: string;

  @ApiProperty({
    example: 72,
    description: '0~100. 100 = 해당 관광지 역대 최대 방문 수준',
  })
  rate: number;

  @ApiProperty({
    example: true,
    description: 'rate >= 60 이면 true (혼잡 배지 권장)',
  })
  busy: boolean;
}

export class TourCongestionDto {
  @ApiProperty({ example: '126508' })
  contentId: string;

  @ApiProperty({ example: '경복궁' })
  name: string;

  @ApiProperty({ type: [TourCongestionDayDto], description: '향후 예측일 배열' })
  days: TourCongestionDayDto[];

  @ApiProperty({
    type: TourCongestionDayDto,
    nullable: true,
    description: '가장 높은 rate 날짜',
  })
  peak: TourCongestionDayDto | null;

  @ApiProperty({
    type: [TourCongestionDayDto],
    description: 'busy=true 인 날만',
  })
  busyDays: TourCongestionDayDto[];
}

export class TourCodeItemDto {
  @ApiProperty({ example: '11' })
  code: string;

  @ApiProperty({ example: '서울특별시' })
  name: string;
}
