import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Place, PlaceDocument } from '../schemas/place.schema';
import { TourApiClient } from './tour-api.client';
import {
  cacheGet,
  cacheSet,
  cleanPlaceKeyword,
  CodeItem,
  CongestionDay,
  extractBodyMeta,
  extractItems,
  FestivalCard,
  HubPlaceCard,
  latestBaseYm,
  PetTourInfo,
  PlaceCard,
  PlaceDetail,
  RelatedPlaceCard,
  SyncPlaceCard,
  toCodeItem,
  toCongestionDay,
  toFestivalCard,
  toHubCard,
  toPetTourInfo,
  toPlaceCard,
  toPlaceImages,
  toRelatedCard,
  toSyncCard,
  toVisitorStat,
  VisitorStat,
} from './tour.util';
import {
  CategoryCodeQueryDto,
  CongestionQueryDto,
  FestivalQueryDto,
  LdongCodeQueryDto,
  ListPlacesQueryDto,
  NearbyPlacesQueryDto,
  RegionHighlightsQueryDto,
  SearchPlacesQueryDto,
  StayQueryDto,
  SyncQueryDto,
  VisitorsQueryDto,
} from './dto/tour-query.dto';

const LIST_TTL = 10 * 60 * 1000; // 10m
const DETAIL_TTL = 24 * 60 * 60 * 1000; // 24h
const META_TTL = 7 * 24 * 60 * 60 * 1000; // 7d (지역·분류 코드)

type Page<T> = {
  data: T[];
  meta: { total: number; page: number; size: number };
};
type PlacePage = Page<PlaceCard>;

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
      areaCode: commonItem.areacode || null,
      sigunguCode: commonItem.sigungucode || null,
      images: toPlaceImages(extractItems(images)),
      intro: (extractItems(intro)[0] ?? {}) as Record<string, unknown>,
      repeatingInfo: extractItems(info) as Record<string, unknown>[],
    };

    detail.placeId = await this.upsertPlace(detail);
    cacheSet(key, detail, DETAIL_TTL);
    return detail;
  }

  /**
   * 비슷한 장소.
   * 1순위: TarRlteTarService1 (티맵 연계 방문)
   * 실패 시: KorService2 locationBasedList2 주변 같은 유형으로 fallback
   */
  async similar(
    contentId: string,
    contentTypeId?: number,
    size = 10,
  ): Promise<{
    data: RelatedPlaceCard[];
    meta: { total: number; page: number; size: number; source: string };
  }> {
    const key = `tour:similar:${contentId}:${size}`;
    const cached = cacheGet<{
      data: RelatedPlaceCard[];
      meta: { total: number; page: number; size: number; source: string };
    }>(key);
    if (cached) return cached;

    const detail = await this.detail(contentId, contentTypeId);

    try {
      const related = await this.relatedByKeyword(
        detail,
        size,
      );
      if (related.data.length > 0) {
        cacheSet(key, related, LIST_TTL);
        return related;
      }
    } catch {
      // fall through to nearby
    }

    const fallback = await this.similarNearbyFallback(
      detail,
      contentTypeId,
      size,
    );
    cacheSet(key, fallback, LIST_TTL);
    return fallback;
  }

  private async relatedByKeyword(
    detail: PlaceDetail,
    size: number,
  ): Promise<{
    data: RelatedPlaceCard[];
    meta: { total: number; page: number; size: number; source: string };
  }> {
    const baseYm = latestBaseYm();
    const keyword = cleanPlaceKeyword(detail.name);
    if (!detail.areaCode || !detail.sigunguCode) {
      throw new Error('missing area codes');
    }

    const data = await this.client.callService('related', 'searchKeyword1', {
      baseYm,
      keyword,
      areaCd: detail.areaCode,
      signguCd: detail.sigunguCode,
      numOfRows: size,
      pageNo: 1,
    });

    const cards = extractItems(data)
      .map(toRelatedCard)
      .filter((c) => c.name && c.name !== keyword)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, size);

    return {
      data: cards,
      meta: {
        total: cards.length,
        page: 1,
        size,
        source: 'RELATED_API',
      },
    };
  }

  private async similarNearbyFallback(
    detail: PlaceDetail,
    contentTypeId: number | undefined,
    size: number,
  ): Promise<{
    data: RelatedPlaceCard[];
    meta: { total: number; page: number; size: number; source: string };
  }> {
    if (detail.longitude == null || detail.latitude == null) {
      return {
        data: [],
        meta: { total: 0, page: 1, size, source: 'NEARBY_FALLBACK' },
      };
    }

    const data = await this.client.call('locationBasedList2', {
      mapX: detail.longitude,
      mapY: detail.latitude,
      radius: 20000,
      contentTypeId: contentTypeId ?? detail.contentTypeId,
      arrange: 'E',
      numOfRows: size + 1,
      pageNo: 1,
    });

    const cards: RelatedPlaceCard[] = extractItems(data)
      .map(toPlaceCard)
      .filter((c) => c.id !== detail.id)
      .slice(0, size)
      .map((c, i) => ({
        ...c,
        name: c.name,
        rank: i + 1,
        categoryLarge: c.contentTypeLabel,
        categoryMedium: null,
        categorySmall: null,
        areaName: null,
        sigunguName: null,
        tatsCode: null,
        source: 'NEARBY_FALLBACK' as const,
      }));

    return {
      data: cards,
      meta: {
        total: cards.length,
        page: 1,
        size,
        source: 'NEARBY_FALLBACK',
      },
    };
  }

  /** 기초지자체 중심 관광지 (LocgoHubTarService1). */
  async regionHighlights(
    areaCd: string,
    query: RegionHighlightsQueryDto,
  ): Promise<{ data: HubPlaceCard[]; meta: { total: number; baseYm: string } }> {
    const baseYm = query.baseYm ?? latestBaseYm();
    const key = `tour:hub:${areaCd}:${query.signguCd}:${baseYm}:${query.size ?? 20}`;
    const cached = cacheGet<{
      data: HubPlaceCard[];
      meta: { total: number; baseYm: string };
    }>(key);
    if (cached) return cached;

    const data = await this.client.callService('hub', 'areaBasedList1', {
      baseYm,
      areaCd,
      signguCd: query.signguCd,
      numOfRows: query.size ?? 20,
      pageNo: 1,
    });

    const cards = extractItems(data)
      .map(toHubCard)
      .sort((a, b) => a.rank - b.rank);

    const page = {
      data: cards,
      meta: { total: cards.length, baseYm },
    };
    cacheSet(key, page, LIST_TTL);
    return page;
  }

  /** 지역별 방문자수 (DataLabService). */
  async visitors(query: VisitorsQueryDto): Promise<{
    data: VisitorStat[];
    meta: { total: number; page: number; size: number; level: string };
  }> {
    const key = `tour:visitors:${JSON.stringify(query)}`;
    const cached = cacheGet<{
      data: VisitorStat[];
      meta: { total: number; page: number; size: number; level: string };
    }>(key);
    if (cached) return cached;

    const op =
      query.level === 'metro'
        ? 'metcoRegnVisitrDDList'
        : 'locgoRegnVisitrDDList';

    const data = await this.client.callService('datalab', op, {
      startYmd: query.startYmd,
      endYmd: query.endYmd,
      numOfRows: query.size ?? 100,
      pageNo: query.page ?? 1,
    });

    const page = {
      data: extractItems(data).map(toVisitorStat),
      meta: {
        ...extractBodyMeta(data),
        level: query.level,
      },
    };
    cacheSet(key, page, LIST_TTL);
    return page;
  }

  /**
   * 관광지 집중률·향후 30일 예측 (TatsCnctrRateService).
   * rate >= 60 → busy(혼잡 배지) 권장.
   */
  async congestion(
    contentId: string,
    query: CongestionQueryDto,
  ): Promise<{
    contentId: string;
    name: string;
    days: CongestionDay[];
    peak: CongestionDay | null;
    busyDays: CongestionDay[];
  }> {
    const key = `tour:cnctr:${contentId}:${query.areaCd ?? ''}:${query.signguCd ?? ''}`;
    const cached = cacheGet<{
      contentId: string;
      name: string;
      days: CongestionDay[];
      peak: CongestionDay | null;
      busyDays: CongestionDay[];
    }>(key);
    if (cached) return cached;

    const detail = await this.detail(contentId);
    const areaCd = query.areaCd ?? detail.areaCode;
    const signguCd = query.signguCd ?? detail.sigunguCode;
    if (!areaCd || !signguCd) {
      return {
        contentId,
        name: detail.name,
        days: [],
        peak: null,
        busyDays: [],
      };
    }

    const data = await this.client.callService(
      'cnctr',
      'tatsCnctrRatedList',
      {
        areaCd,
        signguCd,
        numOfRows: 100,
        pageNo: 1,
      },
    );

    const keyword = cleanPlaceKeyword(detail.name);
    const rows = extractItems(data).filter((r) => {
      const nm = r.tAtsNm ?? '';
      return nm === keyword || nm.includes(keyword) || keyword.includes(nm);
    });
    // 이름 매칭 실패 시 해당 시군구 전체 중 동일 이름 근접이 없으면 빈 배열
    const days = (rows.length ? rows : [])
      .map(toCongestionDay)
      .filter((d) => d.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    const peak =
      days.length > 0
        ? days.reduce((a, b) => (b.rate > a.rate ? b : a), days[0])
        : null;
    const busyDays = days.filter((d) => d.busy);

    const result = {
      contentId,
      name: detail.name,
      days,
      peak,
      busyDays,
    };
    cacheSet(key, result, LIST_TTL);
    return result;
  }

  /**
   * TourAPI contentId → places 컬렉션 upsert 후 mongo placeId 반환.
   * 여행방 후보 담기 등 내부 연동용 브리지.
   */
  async resolvePlaceId(
    contentId: string,
    contentTypeId?: number,
  ): Promise<string> {
    const detail = await this.detail(contentId, contentTypeId);
    if (!detail.placeId) {
      throw new NotFoundException('TourAPI place not found');
    }
    return detail.placeId;
  }

  /** 행사·축제 (searchFestival2). eventStartDate 미지정 시 오늘부터. */
  async festivals(query: FestivalQueryDto): Promise<Page<FestivalCard>> {
    const eventStartDate =
      query.eventStartDate ??
      new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheParams = { ...query, eventStartDate };
    const key = `tour:festival:${JSON.stringify(cacheParams)}`;
    const cached = cacheGet<Page<FestivalCard>>(key);
    if (cached) return cached;

    const data = await this.client.call('searchFestival2', {
      eventStartDate,
      eventEndDate: query.eventEndDate,
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      arrange: query.arrange ?? 'O',
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = {
      data: extractItems(data).map(toFestivalCard),
      meta: extractBodyMeta(data),
    };
    cacheSet(key, page, LIST_TTL);
    return page;
  }

  /** 숙박 (searchStay2, contentTypeId 32 고정). */
  async stays(query: StayQueryDto): Promise<PlacePage> {
    const key = `tour:stay:${JSON.stringify(query)}`;
    const cached = cacheGet<PlacePage>(key);
    if (cached) return cached;

    const data = await this.client.call('searchStay2', {
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      arrange: query.arrange ?? 'O',
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = this.toPage(data);
    cacheSet(key, page, LIST_TTL);
    return page;
  }

  /** 동기화용 목록 (areaBasedSyncList2). 배치·캐시 갱신용, showFlag/modifiedTime 포함. */
  async sync(query: SyncQueryDto): Promise<Page<SyncPlaceCard>> {
    const data = await this.client.call('areaBasedSyncList2', {
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      contentTypeId: query.contentTypeId,
      modifiedtime: query.modifiedtime,
      arrange: 'C',
      numOfRows: query.size ?? 100,
      pageNo: query.page ?? 1,
    });

    return {
      data: extractItems(data).map(toSyncCard),
      meta: extractBodyMeta(data),
    };
  }

  /** 반려동물 동반 정보 (detailPetTour2). 미등록이면 null. */
  async petInfo(contentId: string): Promise<PetTourInfo | null> {
    const key = `tour:pet:${contentId}`;
    const cached = cacheGet<PetTourInfo | null>(key);
    if (cached !== undefined) return cached;

    const data = await this.client.call('detailPetTour2', { contentId });
    const info = toPetTourInfo(extractItems(data)[0]);
    cacheSet(key, info, DETAIL_TTL);
    return info;
  }

  /** 법정동 코드 (ldongCode2). 시도/시군구 필터용. */
  async ldongCodes(query: LdongCodeQueryDto): Promise<CodeItem[]> {
    const key = `tour:ldong:${JSON.stringify(query)}`;
    const cached = cacheGet<CodeItem[]>(key);
    if (cached) return cached;

    const data = await this.client.call('ldongCode2', {
      lDongRegnCd: query.lDongRegnCd,
      lDongSignguCd: query.lDongSignguCd,
      numOfRows: query.size ?? 100,
      pageNo: query.page ?? 1,
    });

    const codes = extractItems(data).map(toCodeItem);
    cacheSet(key, codes, META_TTL);
    return codes;
  }

  /** 분류체계 코드 (lclsSystmCode2). 카테고리 필터용. */
  async categoryCodes(query: CategoryCodeQueryDto): Promise<CodeItem[]> {
    const key = `tour:lcls:${JSON.stringify(query)}`;
    const cached = cacheGet<CodeItem[]>(key);
    if (cached) return cached;

    const data = await this.client.call('lclsSystmCode2', {
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      numOfRows: query.size ?? 100,
      pageNo: query.page ?? 1,
    });

    const codes = extractItems(data).map(toCodeItem);
    cacheSet(key, codes, META_TTL);
    return codes;
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
