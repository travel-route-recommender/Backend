import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MobilityService } from './mobility.service';
import {
  DirectionsRequestDto,
  DirectionsResponseDto,
} from './dto/directions.dto';

@ApiTags('모빌리티 · 길찾기')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mobility')
export class MobilityController {
  constructor(private readonly mobilityService: MobilityService) {}

  @Post('directions')
  @ApiOperation({
    summary: '자동차 경로·이동시간 (Kakao Mobility BFF)',
    description:
      '카카오 모빌리티 자동차 길찾기 프록시.\n\n' +
      '- 서버는 `KAKAO_REST_API_KEY`를 사용합니다. 지도 JS 키로는 호출할 수 없습니다.\n' +
      '- 대중교통·막차·입장권은 이 API 범위가 아닙니다.\n' +
      '- 프론트는 지도 표시만 JS 키로 하고, 경로/시간은 이 엔드포인트를 쓰세요.',
  })
  @ApiOkResponse({ type: DirectionsResponseDto })
  directions(@Body() dto: DirectionsRequestDto) {
    return this.mobilityService.directions(dto);
  }

  @Post('transit')
  @ApiOperation({
    summary: '대중교통·막차 (stub)',
    description:
      '프로바이더/키 미정. available:false 반환. 자차는 POST /mobility/directions 사용.',
  })
  transit(
    @Body()
    body: {
      origin?: { lat: number; lng: number };
      destination?: { lat: number; lng: number };
      departureAt?: string;
    },
  ) {
    return {
      available: false,
      reason: 'TRANSIT_PROVIDER_NOT_CONFIGURED',
      origin: body.origin ?? null,
      destination: body.destination ?? null,
      departureAt: body.departureAt ?? null,
      legs: [],
      lastDepartureAt: null,
    };
  }
}
