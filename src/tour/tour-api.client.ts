import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { clean } from './tour.util';

/**
 * Thin wrapper around 한국관광공사 TourAPI (KorService2).
 * All external dependency is confined here; callers never see raw TourAPI shapes.
 */
@Injectable()
export class TourApiClient {
  private readonly logger = new Logger(TourApiClient.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.get<string>(
        'TOUR_API_BASE_URL',
        'https://apis.data.go.kr/B551011/KorService2',
      ),
      timeout: 5_000,
    });
  }

  private get commonParams() {
    return {
      serviceKey: this.config.get<string>('TOUR_API_SERVICE_KEY'),
      MobileOS: this.config.get<string>('TOUR_API_MOBILE_OS', 'ETC'),
      MobileApp: this.config.get<string>('TOUR_API_MOBILE_APP', 'Tourmate'),
      _type: 'json',
    };
  }

  async call<T = unknown>(
    operation: string,
    params: Record<string, string | number | undefined | null>,
    attempt = 0,
  ): Promise<T> {
    try {
      const res = await this.http.get(`/${operation}`, {
        params: {
          ...this.commonParams,
          numOfRows: 20,
          pageNo: 1,
          ...clean(params),
        },
      });

      const data = res.data;

      // Gateway/error responses come back as plain text (or XML), not JSON.
      if (typeof data === 'string') {
        this.logger.error(
          `TourAPI ${operation} non-JSON response: ${data.slice(0, 200)}`,
        );
        throw new HttpException(
          { code: 'TOUR_API_UNAVAILABLE', message: '관광정보 API 응답 오류' },
          HttpStatus.BAD_GATEWAY,
        );
      }

      const header = (data as { response?: { header?: { resultCode?: string; resultMsg?: string } } })
        ?.response?.header;
      if (header && header.resultCode && header.resultCode !== '0000') {
        this.logger.error(
          `TourAPI ${operation} ${header.resultCode} ${header.resultMsg}`,
        );
        throw new HttpException(
          { code: 'TOUR_API_ERROR', message: header.resultMsg ?? '관광정보 조회 실패' },
          HttpStatus.BAD_GATEWAY,
        );
      }

      return data as T;
    } catch (err) {
      if (err instanceof HttpException) throw err;

      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      // Retry once on transient 429/5xx with short backoff.
      if (attempt < 1 && (status === 429 || (status ?? 0) >= 500)) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        return this.call<T>(operation, params, attempt + 1);
      }

      this.logger.error(
        `TourAPI ${operation} failed (status ${status ?? 'n/a'}): ${(err as Error).message}`,
      );
      throw new HttpException(
        { code: 'TOUR_API_UNAVAILABLE', message: '관광정보 API 호출 실패' },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
