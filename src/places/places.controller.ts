import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PlacesService } from './places.service';

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  @Get('search')
  @ApiOperation({ summary: '장소 검색 (Kakao API → DB 캐시, fallback 로컬)' })
  @ApiQuery({ name: 'q', required: false, example: '제주 카페' })
  @ApiQuery({ name: 'category', required: false, example: '관광' })
  @ApiQuery({ name: 'lat', required: false, example: '33.4996' })
  @ApiQuery({ name: 'lng', required: false, example: '126.5312' })
  @ApiQuery({ name: 'page', required: false, example: '1' })
  @ApiQuery({ name: 'limit', required: false, example: '20' })
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
  @ApiOperation({ summary: '유사 장소 추천' })
  @ApiParam({ name: 'placeId', example: '665abc123def456789012345' })
  similar(@Param('placeId') placeId: string) {
    return this.placesService.findSimilar(placeId);
  }

  @Get(':placeId')
  @ApiOperation({ summary: '장소 상세' })
  @ApiParam({ name: 'placeId', example: '665abc123def456789012345' })
  getOne(@Param('placeId') placeId: string) {
    return this.placesService.findById(placeId);
  }
}
