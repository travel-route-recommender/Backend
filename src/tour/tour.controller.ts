import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { TourService } from './tour.service';
import {
  CategoryCodeQueryDto,
  CongestionQueryDto,
  FestivalQueryDto,
  LdongCodeQueryDto,
  ListPlacesQueryDto,
  NearbyPlacesQueryDto,
  PlaceDetailQueryDto,
  RegionHighlightsQueryDto,
  SearchPlacesQueryDto,
  StayQueryDto,
  SyncQueryDto,
  VisitorsQueryDto,
} from './dto/tour-query.dto';
import {
  TourCodeItemDto,
  TourCongestionDto,
  TourFestivalPageDto,
  TourHubPageDto,
  TourPetInfoDto,
  TourPlaceDetailDto,
  TourPlacePageDto,
  TourSimilarPageDto,
  TourSyncPageDto,
  TourVisitorsPageDto,
} from './dto/tour-response.dto';

/**
 * 한국관광공사 TourAPI BFF (KorService2 + 특화 서비스).
 */
@ApiTags('관광 탐색 · TourAPI')
@Controller('tour')
export class TourController {
  constructor(private readonly tourService: TourService) {}

  @Get('places/search')
  @ApiOperation({
    summary: '키워드로 관광지 검색',
    description:
      '예: "성산일출봉", "흑돼지". KorService2 `searchKeyword2`.\n\n' +
      '응답 `id` = contentId. 후보 추가 시 `tourContentId`로 넘기거나 상세의 `placeId`를 쓰세요.',
  })
  @ApiOkResponse({
    description: '검색 결과 페이지',
    type: TourPlacePageDto,
  })
  search(@Query() query: SearchPlacesQueryDto) {
    return this.tourService.search(query);
  }

  @Get('places/nearby')
  @ApiOperation({
    summary: '내 위치 주변 관광지',
    description:
      'GPS(mapX=경도, mapY=위도) 주변. 거리순 + `distanceMeters`. KorService2 `locationBasedList2`.',
  })
  @ApiOkResponse({
    description: '주변 관광지 (distanceMeters 포함)',
    type: TourPlacePageDto,
  })
  nearby(@Query() query: NearbyPlacesQueryDto) {
    return this.tourService.nearby(query);
  }

  @Get('places/sync')
  @ApiOperation({
    summary: '[배치용] 동기화 목록',
    description:
      '캐시·DB 배치 갱신용. 일반 탐색은 `/tour/places` · `/tour/places/search`를 쓰세요.',
  })
  @ApiOkResponse({ type: TourSyncPageDto })
  sync(@Query() query: SyncQueryDto) {
    return this.tourService.sync(query);
  }

  @Get('places/:contentId/pet')
  @ApiOperation({
    summary: '반려동물 동반 가능 여부',
    description: '펫 동반 안내. 없으면 `null`. KorService2 `detailPetTour2`.',
  })
  @ApiParam({ name: 'contentId', example: '1019041' })
  @ApiOkResponse({
    description: '펫 정보. 미등록이면 null',
    type: TourPetInfoDto,
  })
  pet(@Param('contentId') contentId: string) {
    return this.tourService.petInfo(contentId);
  }

  @Get('places/:contentId/similar')
  @ApiOperation({
    summary: '비슷한 장소 (연관 관광지)',
    description:
      '1순위: 티맵 연계 방문 데이터 (`TarRlteTarService1`).\n\n' +
      '실패 시: 주변 같은 유형 관광지(KorService2)로 **자동 fallback**.\n\n' +
      '`meta.source` = `RELATED_API` | `NEARBY_FALLBACK`.',
  })
  @ApiParam({ name: 'contentId', example: '126508', description: '예: 경복궁' })
  @ApiOkResponse({ type: TourSimilarPageDto })
  similar(
    @Param('contentId') contentId: string,
    @Query() query: PlaceDetailQueryDto,
  ) {
    return this.tourService.similar(contentId, query.contentTypeId);
  }

  @Get('places/:contentId/congestion')
  @ApiTags('관광 인사이트 · 빅데이터')
  @ApiOperation({
    summary: '혼잡·집중률 예측 (향후 30일)',
    description:
      '`TatsCnctrRateService`. `cnctrRate` 0~100 (100=역대 최대 수준).\n\n' +
      '`busy: true` = rate ≥ 60 → "이번 주말 혼잡 예정" 배지 권장.\n\n' +
      'areaCd/signguCd 미지정 시 KorService2 상세의 areacode/sigungucode 사용 ' +
      '(코드 체계가 다르면 쿼리로 특화 코드를 직접 넘기세요).',
  })
  @ApiParam({ name: 'contentId', example: '126508' })
  @ApiOkResponse({ type: TourCongestionDto })
  congestion(
    @Param('contentId') contentId: string,
    @Query() query: CongestionQueryDto,
  ) {
    return this.tourService.congestion(contentId, query);
  }

  @Get('places/:contentId')
  @ApiOperation({
    summary: '관광지 상세 (소개·이미지·부가정보 한 번에)',
    description:
      'detailCommon+Intro+Info+Image 병렬 합침. Mongo `placeId`·`areaCode`·`sigunguCode` 포함.',
  })
  @ApiParam({ name: 'contentId', example: '126508' })
  @ApiOkResponse({ type: TourPlaceDetailDto })
  detail(
    @Param('contentId') contentId: string,
    @Query() query: PlaceDetailQueryDto,
  ) {
    return this.tourService.detail(contentId, query.contentTypeId);
  }

  @Get('places')
  @ApiOperation({
    summary: '지역별 관광지 목록',
    description: 'areaCode / sigunguCode / contentTypeId. KorService2 `areaBasedList2`.',
  })
  @ApiOkResponse({ type: TourPlacePageDto })
  list(@Query() query: ListPlacesQueryDto) {
    return this.tourService.list(query);
  }

  @Get('festivals')
  @ApiOperation({
    summary: '행사 · 축제 목록',
    description: 'eventStartDate(YYYYMMDD)부터. 미지정 시 오늘.',
  })
  @ApiOkResponse({ type: TourFestivalPageDto })
  festivals(@Query() query: FestivalQueryDto) {
    return this.tourService.festivals(query);
  }

  @Get('stays')
  @ApiOperation({
    summary: '숙박 목록',
    description: 'contentTypeId 32 숙박. 여행방 숙소 후보용.',
  })
  @ApiOkResponse({ type: TourPlacePageDto })
  stays(@Query() query: StayQueryDto) {
    return this.tourService.stays(query);
  }

  @Get('regions/:areaCd/highlights')
  @ApiTags('관광 인사이트 · 빅데이터')
  @ApiOperation({
    summary: '시군구 중심 관광지 (허브)',
    description:
      '`LocgoHubTarService1`. 지자체에서 가장 많이 연결되는 중심 스팟 (hubRank).\n\n' +
      'destinations seed / 지역 핵심 추천에 사용.\n\n' +
      '특화 areaCd·signguCd 사용 (KorService2 코드와 다를 수 있음).',
  })
  @ApiParam({ name: 'areaCd', example: '1', description: '지역 코드 (예: 1=서울)' })
  @ApiOkResponse({ type: TourHubPageDto })
  regionHighlights(
    @Param('areaCd') areaCd: string,
    @Query() query: RegionHighlightsQueryDto,
  ) {
    return this.tourService.regionHighlights(areaCd, query);
  }

  @Get('analytics/visitors')
  @ApiTags('관광 인사이트 · 빅데이터')
  @ApiOperation({
    summary: '지역별 방문자수 (빅데이터)',
    description:
      '`DataLabService`. KT(내국인)+SKT(외국인).\n\n' +
      '- `level=metro` → 광역 (`metcoRegnVisitrDDList`)\n' +
      '- `level=local` → 기초 (`locgoRegnVisitrDDList`)\n\n' +
      '`visitorType`: domestic / other / foreign (코드 1·2·3 또는 K·E).\n' +
      '월 단위 조회 권장. 광역·기초는 집계 기준이 달라 단순 합산 불가.',
  })
  @ApiOkResponse({ type: TourVisitorsPageDto })
  visitors(@Query() query: VisitorsQueryDto) {
    return this.tourService.visitors(query);
  }

  @Get('meta/ldong-codes')
  @ApiOperation({
    summary: '[필터용] 법정동(시도·시군구) 코드',
    description: '미지정 시 시도 목록. `lDongRegnCd` 주면 시군구.',
  })
  @ApiOkResponse({ type: TourCodeItemDto, isArray: true })
  ldongCodes(@Query() query: LdongCodeQueryDto) {
    return this.tourService.ldongCodes(query);
  }

  @Get('meta/category-codes')
  @ApiOperation({
    summary: '[필터용] 분류체계 코드',
    description: '카테고리 필터. lclsSystm1/2로 하위 분류.',
  })
  @ApiOkResponse({ type: TourCodeItemDto, isArray: true })
  categoryCodes(@Query() query: CategoryCodeQueryDto) {
    return this.tourService.categoryCodes(query);
  }
}
