import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { clean } from './tour.util';

export type TourServiceKind =
  | 'kor'
  | 'related'
  | 'hub'
  | 'datalab'
  | 'cnctr';

/**
 * 한국관광공사 TourAPI 공통 클라이언트.
 * KorService2 + 특화 서비스(연관/중심/방문자/집중률)를 base URL만 바꿔 호출한다.
 */
@Injectable()
export class TourApiClient {
  private readonly logger = new Logger(TourApiClient.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({ timeout: 8_000 });
  }

  private get commonParams() {
    return {
      serviceKey: this.config.get<string>('TOUR_API_SERVICE_KEY'),
      MobileOS: this.config.get<string>('TOUR_API_MOBILE_OS', 'ETC'),
      MobileApp: this.config.get<string>('TOUR_API_MOBILE_APP', 'Tourmate'),
      _type: 'json',
    };
  }

  private baseUrl(kind: TourServiceKind): string {
    const defaults: Record<TourServiceKind, string> = {
      kor: 'https://apis.data.go.kr/B551011/KorService2',
      related: 'https://apis.data.go.kr/B551011/TarRlteTarService1',
      hub: 'https://apis.data.go.kr/B551011/LocgoHubTarService1',
      datalab: 'https://apis.data.go.kr/B551011/DataLabService',
      cnctr: 'https://apis.data.go.kr/B551011/TatsCnctrRateService',
    };
    const envKeys: Record<TourServiceKind, string> = {
      kor: 'TOUR_API_BASE_URL',
      related: 'TOUR_RELATED_API_BASE_URL',
      hub: 'TOUR_HUB_API_BASE_URL',
      datalab: 'TOUR_DATALAB_API_BASE_URL',
      cnctr: 'TOUR_CNCTR_API_BASE_URL',
    };
    return this.config.get<string>(envKeys[kind], defaults[kind]);
  }

  /** KorService2 기본 호출 (기존 호환). */
  async call<T = unknown>(
    operation: string,
    params: Record<string, string | number | undefined | null>,
    attempt = 0,
  ): Promise<T> {
    return this.callService<T>('kor', operation, params, attempt);
  }

  async callService<T = unknown>(
    kind: TourServiceKind,
    operation: string,
    params: Record<string, string | number | undefined | null>,
    attempt = 0,
  ): Promise<T> {
    const baseURL = this.baseUrl(kind);
    const label = `${kind}/${operation}`;
    try {
      const res = await this.http.get(`/${operation}`, {
        baseURL,
        params: {
          ...this.commonParams,
          numOfRows: 20,
          pageNo: 1,
          ...clean(params),
        },
      });

      const data = res.data;

      if (typeof data === 'string') {
        this.logger.error(
          `TourAPI ${label} non-JSON: ${data.slice(0, 200)}`,
        );
        throw new HttpException(
          {
            code: 'TOUR_API_UNAVAILABLE',
            message: '관광정보 API 응답 오류',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      const header = (
        data as {
          response?: { header?: { resultCode?: string; resultMsg?: string } };
        }
      )?.response?.header;
      if (header && header.resultCode && header.resultCode !== '0000') {
        this.logger.error(
          `TourAPI ${label} ${header.resultCode} ${header.resultMsg}`,
        );
        throw new HttpException(
          {
            code: 'TOUR_API_ERROR',
            message: header.resultMsg ?? '관광정보 조회 실패',
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      return data as T;
    } catch (err) {
      if (err instanceof HttpException) throw err;

      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (attempt < 1 && (status === 429 || (status ?? 0) >= 500)) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        return this.callService<T>(kind, operation, params, attempt + 1);
      }

      this.logger.error(
        `TourAPI ${label} failed (status ${status ?? 'n/a'}): ${(err as Error).message}`,
      );
      throw new HttpException(
        {
          code: 'TOUR_API_UNAVAILABLE',
          message: '관광정보 API 호출 실패',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
