import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PlacesService } from './places.service';
import {
  PlaceDto,
  PlaceSearchPageDto,
} from '../common/dto/swagger-responses.dto';

@ApiTags('장소 · Kakao/DB')
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('search')
  @ApiOperation({
    summary: '일반 장소 검색 (Kakao · DB)',
    description:
      '**관광지 탐색의 메인이 아닙니다.** 카페·상점 등 관광공사에 없는 POI용입니다.\n\n' +
      '관광지·축제·숙박은 `/tour/places/*` (TourAPI)를 쓰세요.\n\n' +
      'Kakao Local → DB upsert. Kakao 키 없거나 실패 시 로컬 DB 텍스트 검색으로 fallback.',
  })
  @ApiQuery({ name: 'q', required: false, example: '제주 카페' })
  @ApiQuery({ name: 'category', required: false, example: '관광' })
  @ApiQuery({ name: 'lat', required: false, example: '33.4996' })
  @ApiQuery({ name: 'lng', required: false, example: '126.5312' })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'limit', required: false, example: '20' })
  @ApiOkResponse({ type: PlaceSearchPageDto })
  search(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.placesService.search({
      q,
      category,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get(':placeId/similar')
  @ApiOperation({
    summary: '유사 장소 (DB 태그·카테고리 기준)',
    description:
      '우리 DB에 저장된 장소의 태그/카테고리로 비슷한 곳을 찾습니다.\n\n' +
      'TourAPI 관광지의 "비슷한 장소"는 `/tour/places/{contentId}/similar`를 쓰세요.',
  })
  @ApiParam({
    name: 'placeId',
    example: '665abc123def456789012345',
    description: 'Mongo placeId (ObjectId)',
  })
  @ApiOkResponse({ type: PlaceDto, isArray: true })
  similar(@Param('placeId') placeId: string) {
    return this.placesService.findSimilar(placeId);
  }

  @Get(':placeId')
  @ApiOperation({
    summary: '장소 상세 (DB)',
    description:
      'Mongo `placeId`로 저장된 장소 문서 조회.\n\n' +
      'TourAPI contentId로 상세를 보려면 `/tour/places/{contentId}`를 쓰세요.',
  })
  @ApiParam({
    name: 'placeId',
    example: '665abc123def456789012345',
    description: 'Mongo placeId (ObjectId)',
  })
  @ApiOkResponse({ type: PlaceDto })
  getOne(@Param('placeId') placeId: string) {
    return this.placesService.findById(placeId);
  }
}
