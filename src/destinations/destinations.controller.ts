import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DestinationsService } from './destinations.service';

@ApiTags('destinations')
@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinationsService: DestinationsService) {}

  @Get('popular')
  @ApiOperation({ summary: '인기 여행지 Top 10 (popularityScore 기준)' })
  getPopular() {
    return this.destinationsService.getPopular();
  }
}
