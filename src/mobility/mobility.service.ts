import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppCacheService } from '../common/cache/app-cache.service';
import {
  DirectionsRequestDto,
  DirectionsResponseDto,
  LatLngDto,
} from './dto/directions.dto';

const DIRECTIONS_TTL = 10 * 60 * 1000; // 10m
const NAVI_BASE = 'https://apis-navi.kakaomobility.com';

type KakaoRoute = {
  summary?: {
    distance?: number;
    duration?: number;
    fare?: { taxi?: number; toll?: number };
  };
  sections?: Array<{
    roads?: Array<{
      vertexes?: number[];
    }>;
  }>;
};

type KakaoDirectionsBody = {
  routes?: KakaoRoute[];
  code?: number;
  msg?: string;
};

@Injectable()
export class MobilityService {
  private readonly logger = new Logger(MobilityService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cache: AppCacheService,
  ) {}

  async directions(dto: DirectionsRequestDto): Promise<DirectionsResponseDto> {
    const kakaoKey = this.config.get<string>('KAKAO_REST_API_KEY');
    if (!kakaoKey) {
      throw new ServiceUnavailableException({
        code: 'KAKAO_KEY_MISSING',
        message:
          'KAKAO_REST_API_KEY가 없습니다. 서버 REST 키가 필요합니다 (지도 JS 키 아님).',
      });
    }

    const priority = dto.priority ?? 'RECOMMEND';
    const summaryOnly = dto.summaryOnly !== false;
    const cacheKey = this.buildCacheKey(dto, priority, summaryOnly);
    const cached = await this.cache.get<DirectionsResponseDto>(cacheKey);
    if (cached) return cached;

    const params: Record<string, string | boolean> = {
      origin: this.toNaviPoint(dto.origin),
      destination: this.toNaviPoint(dto.destination),
      priority,
      summary: summaryOnly,
      alternatives: false,
      road_details: !summaryOnly,
    };

    if (dto.waypoints?.length) {
      params.waypoints = dto.waypoints.map((w) => this.toNaviPoint(w)).join('|');
    }

    try {
      const { data } = await axios.get<KakaoDirectionsBody>(
        `${NAVI_BASE}/v1/directions`,
        {
          headers: { Authorization: `KakaoAK ${kakaoKey}` },
          params,
          timeout: 8_000,
        },
      );

      if (data.code != null && data.code !== 0) {
        this.logger.warn(`Kakao Navi error code=${data.code} msg=${data.msg}`);
        throw new HttpException(
          {
            code: 'KAKAO_DIRECTIONS_FAILED',
            message: data.msg ?? '길찾기 실패',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      const route = data.routes?.[0];
      if (!route?.summary) {
        throw new HttpException(
          {
            code: 'KAKAO_DIRECTIONS_EMPTY',
            message: '경로 결과가 없습니다',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      const result: DirectionsResponseDto = {
        distanceMeters: route.summary.distance ?? 0,
        durationSeconds: route.summary.duration ?? 0,
        fare: {
          taxi: route.summary.fare?.taxi,
          toll: route.summary.fare?.toll,
        },
        source: 'kakao-mobility',
      };

      if (!summaryOnly) {
        result.path = this.extractPath(route);
      }

      await this.cache.set(cacheKey, result, DIRECTIONS_TTL);
      return result;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(
        `Kakao directions request failed: ${(err as Error).message}`,
      );
      throw new HttpException(
        {
          code: 'KAKAO_DIRECTIONS_UNAVAILABLE',
          message: '길찾기 API를 사용할 수 없습니다',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * 좌표가 없으면 null. 실패해도 throw하지 않고 null (두리 분석용).
   */
  async safeDirections(
    origin: LatLngDto,
    destination: LatLngDto,
  ): Promise<DirectionsResponseDto | null> {
    try {
      return await this.directions({
        origin,
        destination,
        summaryOnly: true,
      });
    } catch {
      return null;
    }
  }

  private toNaviPoint(p: LatLngDto): string {
    // Kakao Navi: "lng,lat"
    return `${p.lng},${p.lat}`;
  }

  private buildCacheKey(
    dto: DirectionsRequestDto,
    priority: string,
    summaryOnly: boolean,
  ): string {
    const bucket = (n: number) => AppCacheService.bucketCoord(n, 4);
    const o = `${bucket(dto.origin.lat)},${bucket(dto.origin.lng)}`;
    const d = `${bucket(dto.destination.lat)},${bucket(dto.destination.lng)}`;
    const w = (dto.waypoints ?? [])
      .map((p) => `${bucket(p.lat)},${bucket(p.lng)}`)
      .join('|');
    return `mobility:dir:${priority}:${summaryOnly}:${o}:${d}:${w}`;
  }

  private extractPath(route: KakaoRoute): { lat: number; lng: number }[] {
    const points: { lat: number; lng: number }[] = [];
    for (const section of route.sections ?? []) {
      for (const road of section.roads ?? []) {
        const v = road.vertexes ?? [];
        for (let i = 0; i + 1 < v.length; i += 2) {
          points.push({ lng: v[i], lat: v[i + 1] });
        }
      }
    }
    return points;
  }
}
