import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DestinationsService } from './destinations.service';
import { PopularDestinationDto } from '../common/dto/swagger-responses.dto';

@ApiTags('인기 여행지')
@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinationsService: DestinationsService) {}

  @Get('popular')
  @ApiOperation({
    summary: '인기 여행지 Top 10',
    description:
      'DB `popularityScore` 기준 MVP입니다. 탐색 홈 추천 영역에 쓰면 됩니다. (관광공사 방문자수 빅데이터 연동 전)',
  })
  @ApiOkResponse({
    type: PopularDestinationDto,
    isArray: true,
    description: 'popularityScore 내림차순 Top 10',
  })
  getPopular() {
    return this.destinationsService.getPopular();
  }
}
