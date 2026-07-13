import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TourService } from './tour.service';
import {
  ListPlacesQueryDto,
  NearbyPlacesQueryDto,
  PlaceDetailQueryDto,
  SearchPlacesQueryDto,
} from './dto/tour-query.dto';

/**
 * 한국관광공사 TourAPI(KorService2) BFF.
 * 프론트는 data.go.kr를 직접 호출하지 않고 이 엔드포인트만 사용한다.
 */
@ApiTags('tour')
@Controller('tour/places')
export class TourController {
  constructor(private readonly tourService: TourService) {}

  @Get('search')
  @ApiOperation({ summary: '키워드 검색 (searchKeyword2)' })
  search(@Query() query: SearchPlacesQueryDto) {
    return this.tourService.search(query);
  }

  @Get('nearby')
  @ApiOperation({ summary: '현 위치 주변 (locationBasedList2, 거리순)' })
  nearby(@Query() query: NearbyPlacesQueryDto) {
    return this.tourService.nearby(query);
  }

  @Get(':contentId')
  @ApiOperation({
    summary: '장소 상세 (detailCommon2 + Intro/Info/Image 병렬 조합)',
  })
  @ApiParam({ name: 'contentId', example: '126508' })
  detail(
    @Param('contentId') contentId: string,
    @Query() query: PlaceDetailQueryDto,
  ) {
    return this.tourService.detail(contentId, query.contentTypeId);
  }

  @Get()
  @ApiOperation({ summary: '지역 기반 목록 (areaBasedList2)' })
  list(@Query() query: ListPlacesQueryDto) {
    return this.tourService.list(query);
  }
}
