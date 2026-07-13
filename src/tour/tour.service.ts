import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Place, PlaceDocument } from '../schemas/place.schema';
import { TourApiClient } from './tour-api.client';
import {
  cacheGet,
  cacheSet,
  extractBodyMeta,
  extractItems,
  PlaceCard,
  PlaceDetail,
  toPlaceCard,
  toPlaceImages,
} from './tour.util';
import {
  ListPlacesQueryDto,
  NearbyPlacesQueryDto,
  SearchPlacesQueryDto,
} from './dto/tour-query.dto';

const LIST_TTL = 10 * 60 * 1000; // 10m
const DETAIL_TTL = 24 * 60 * 60 * 1000; // 24h

type PlacePage = {
  data: PlaceCard[];
  meta: { total: number; page: number; size: number };
};

@Injectable()
export class TourService {
  constructor(
    private readonly client: TourApiClient,
    @InjectModel(Place.name) private readonly placeModel: Model<PlaceDocument>,
  ) {}

  async list(query: ListPlacesQueryDto): Promise<PlacePage> {
    const key = `tour:list:${JSON.stringify(query)}`;
    const cached = cacheGet<PlacePage>(key);
    if (cached) return cached;

    const data = await this.client.call('areaBasedList2', {
      arrange: query.arrange ?? 'O',
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      contentTypeId: query.contentTypeId,
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = this.toPage(data);
    cacheSet(key, page, LIST_TTL);
    return page;
  }

  async search(query: SearchPlacesQueryDto): Promise<PlacePage> {
    const key = `tour:search:${JSON.stringify(query)}`;
    const cached = cacheGet<PlacePage>(key);
    if (cached) return cached;

    const data = await this.client.call('searchKeyword2', {
      keyword: query.keyword,
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      contentTypeId: query.contentTypeId,
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = this.toPage(data);
    cacheSet(key, page, LIST_TTL);
    return page;
  }

  async nearby(query: NearbyPlacesQueryDto): Promise<PlacePage> {
    const key = `tour:nearby:${JSON.stringify(query)}`;
    const cached = cacheGet<PlacePage>(key);
    if (cached) return cached;

    const data = await this.client.call('locationBasedList2', {
      mapX: query.mapX,
      mapY: query.mapY,
      radius: query.radius ?? 2000,
      contentTypeId: query.contentTypeId,
      arrange: 'E', // 거리순
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = this.toPage(data);
    cacheSet(key, page, LIST_TTL);
    return page;
  }

  /**
   * detailCommon2로 기본정보(+contenttypeid)를 먼저 받고,
   * 거기서 얻은 타입으로 Intro/Info/Image를 병렬 호출해 하나로 합침.
   * KorService2의 detailCommon2는 contentTypeId를 받지 않는다.
   */
  async detail(
    contentId: string,
    contentTypeId?: number,
  ): Promise<PlaceDetail> {
    const key = `tour:place:${contentId}`;
    const cached = cacheGet<PlaceDetail>(key);
    if (cached) return cached;

    const common = await this.client.call('detailCommon2', { contentId });
    const commonItem = extractItems(common)[0] ?? {};
    const card = toPlaceCard(commonItem);

    const resolvedTypeId =
      contentTypeId ??
      (commonItem.contenttypeid ? Number(commonItem.contenttypeid) : undefined);

    // 부가정보는 실패해도 상세 전체가 죽지 않도록 개별 fallback.
    const [intro, info, images] = await Promise.all([
      this.safeCall('detailIntro2', {
        contentId,
        contentTypeId: resolvedTypeId,
      }),
      this.safeCall('detailInfo2', {
        contentId,
        contentTypeId: resolvedTypeId,
      }),
      this.safeCall('detailImage2', { contentId, imageYN: 'Y' }),
    ]);

    const detail: PlaceDetail = {
      ...card,
      placeId: null,
      overview: commonItem.overview || null,
      homepage: commonItem.homepage || null,
      tel: commonItem.tel || null,
      images: toPlaceImages(extractItems(images)),
      intro: (extractItems(intro)[0] ?? {}) as Record<string, unknown>,
      repeatingInfo: extractItems(info) as Record<string, unknown>[],
    };

    detail.placeId = await this.upsertPlace(detail);
    cacheSet(key, detail, DETAIL_TTL);
    return detail;
  }

  /** 부가정보 호출 실패(파라미터 오류 등)는 무시하고 빈 데이터로 처리. */
  private async safeCall(
    operation: string,
    params: Record<string, string | number | undefined>,
  ): Promise<unknown> {
    try {
      return await this.client.call(operation, params);
    } catch {
      return undefined;
    }
  }

  private toPage(data: unknown): PlacePage {
    return {
      data: extractItems(data).map(toPlaceCard),
      meta: extractBodyMeta(data),
    };
  }

  /**
   * contentId 기준으로 places 컬렉션에 upsert.
   * 내부 PK(_id)와 external_id(contentId)를 분리해 여행방 후보/저장에 재사용.
   */
  private async upsertPlace(detail: PlaceDetail): Promise<string | null> {
    if (!detail.id || detail.id === 'undefined') return null;

    const doc = await this.placeModel.findOneAndUpdate(
      { source: 'tour', externalId: detail.id },
      {
        $set: {
          source: 'tour',
          externalId: detail.id,
          contentTypeId: detail.contentTypeId,
          name: detail.name,
          address: detail.address ?? '',
          lat: detail.latitude ?? undefined,
          lng: detail.longitude ?? undefined,
          images: detail.images.map((i) => i.url),
          description: detail.overview ?? '',
          category: detail.contentTypeLabel ?? undefined,
          phone: detail.tel ?? undefined,
          placeUrl: detail.homepage ?? undefined,
        },
      },
      { upsert: true, new: true },
    );

    return doc._id.toString();
  }
}
