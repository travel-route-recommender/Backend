import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService, ReadinessResponse } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: '프로세스 생존 확인' })
  live() {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: 'MongoDB와 보안 저장소 준비 상태 확인' })
  ready(): Promise<ReadinessResponse> {
    return this.health.ready();
  }
}
