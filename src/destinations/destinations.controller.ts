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
      'DB에 저장된 `popularityScore`를 기준으로 탐색 홈의 여행지를 정렬합니다.',
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
