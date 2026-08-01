import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Place, PlaceDocument } from '../schemas/place.schema';
import { AppCacheService } from '../common/cache/app-cache.service';
import { TourApiClient } from './tour-api.client';
import {
  bucketCoord,
  CategoryCodeTreeItem,
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
  RegionCodeItem,
  RegionCodeTreeItem,
  regionSearchTokens,
  SyncPlaceCard,
  toCodeItem,
  toCongestionDay,
  toCategoryCodeTree,
  toFestivalCard,
  toHubCard,
  toPetTourInfo,
  toPlaceCard,
  toPlaceImages,
  toRelatedCard,
  toSyncCard,
  toVisitorStat,
  VisitorStat,
  REGION_AREA_CODES,
  resolveRegionAreaCode,
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
import {
  buildPlacePopularityIncrement,
  DEFAULT_PLACE_POPULARITY_STATS,
} from '../places/place-popularity';

const LIST_TTL = 10 * 60 * 1000; // 10m
const DETAIL_TTL = 24 * 60 * 60 * 1000; // 24h
const META_TTL = 7 * 24 * 60 * 60 * 1000; // 7d (지역·분류 코드)

type Page<T> = {
  data: T[];
  meta: { total: number; page: number; size: number };
};
type PlacePage = Page<PlaceCard>;
type StoredTourPlaceQuery = Pick<
  ListPlacesQueryDto,
  | 'areaCode'
  | 'sigunguCode'
  | 'contentTypeId'
  | 'lclsSystm1'
  | 'lclsSystm2'
  | 'lclsSystm3'
  | 'page'
  | 'size'
> & {
  keyword?: string;
};

@Injectable()
export class TourService {
  constructor(
    private readonly client: TourApiClient,
    private readonly cache: AppCacheService,
    @InjectModel(Place.name) private readonly placeModel: Model<PlaceDocument>,
  ) {}

  async list(query: ListPlacesQueryDto): Promise<PlacePage> {
    if (query.sort === 'popular') {
      return this.findStoredTourPlaces(query);
    }

    const key = `tour:list:${JSON.stringify(query)}`;
    const cached = await this.cache.get<PlacePage>(key);
    if (cached) {
      await this.bulkUpsertTourPlaceCards(cached.data);
      return cached;
    }

    const data = await this.client.call('areaBasedList2', {
      arrange: query.arrange ?? 'O',
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      contentTypeId: query.contentTypeId,
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      lclsSystm3: query.lclsSystm3,
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = this.toPage(data);
    await this.bulkUpsertTourPlaceCards(page.data);
    await this.cache.set(key, page, LIST_TTL);
    return page;
  }

  async regionCodes(): Promise<CodeItem[]> {
    return REGION_AREA_CODES.map(({ code, name }) => ({ code, name }));
  }

  async regionCodeTree(): Promise<RegionCodeTreeItem[]> {
    const key = 'tour:region-codes:tree';
    const cached = await this.cache.get<RegionCodeTreeItem[]>(key);
    if (cached) return cached;

    const areas = await Promise.all(
      REGION_AREA_CODES.map(async (region): Promise<RegionCodeTreeItem> => {
        const data = await this.client.call('areaCode2', {
          areaCode: region.code,
          numOfRows: 100,
          pageNo: 1,
        });

        return {
          code: region.code,
          name: region.name,
          sigungu: extractItems(data).map(toCodeItem),
        };
      }),
    );

    await this.cache.set(key, areas, META_TTL);
    return areas;
  }

  async suggestRegions(keyword: string, size = 10): Promise<CodeItem[]> {
    const q = keyword.trim();
    if (!q) return [];

    const normalized = q.toLowerCase().replace(/\s+/g, '');
    const matches = REGION_AREA_CODES.filter((region) =>
      regionSearchTokens(region).some((token) => token.includes(normalized)),
    )
      .slice(0, size)
      .map(({ code, name }) => ({ code, name }));

    return matches;
  }

  async listByRegion(
    region: string,
    query: ListPlacesQueryDto,
  ): Promise<PlacePage> {
    const resolved = resolveRegionAreaCode(region);
    if (!resolved) {
      return this.list({ ...query, areaCode: region });
    }

    return this.list({
      ...query,
      areaCode: resolved.code,
    });
  }

  async searchWithinRegion(
    region: string,
    query: {
      keyword?: string;
      sigunguCode?: string;
      contentTypeId?: number;
      lclsSystm1?: string;
      lclsSystm2?: string;
      lclsSystm3?: string;
      sort?: 'provider' | 'popular';
      page?: number;
      size?: number;
    },
  ): Promise<PlacePage> {
    const resolved = resolveRegionAreaCode(region);
    const areaCode = resolved?.code ?? region;
    const keyword = query.keyword?.trim();

    if (keyword) {
      return this.search({
        keyword,
        areaCode,
        sigunguCode: query.sigunguCode,
        contentTypeId: query.contentTypeId,
        lclsSystm1: query.lclsSystm1,
        lclsSystm2: query.lclsSystm2,
        lclsSystm3: query.lclsSystm3,
        sort: query.sort,
        page: query.page,
        size: query.size,
      });
    }

    return this.list({
      areaCode,
      sigunguCode: query.sigunguCode,
      contentTypeId: query.contentTypeId,
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      lclsSystm3: query.lclsSystm3,
      sort: query.sort,
      page: query.page,
      size: query.size,
    });
  }

  async search(query: SearchPlacesQueryDto): Promise<PlacePage> {
    if (query.sort === 'popular') {
      return this.findStoredTourPlaces(query);
    }

    const key = `tour:search:${JSON.stringify(query)}`;
    const cached = await this.cache.get<PlacePage>(key);
    if (cached) {
      await this.recordTourSearchResults(cached.data);
      return cached;
    }

    const data = await this.client.call('searchKeyword2', {
      keyword: query.keyword,
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      contentTypeId: query.contentTypeId,
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      lclsSystm3: query.lclsSystm3,
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = this.toPage(data);
    await this.recordTourSearchResults(page.data);
    await this.cache.set(key, page, LIST_TTL);
    return page;
  }

  async nearby(query: NearbyPlacesQueryDto): Promise<PlacePage> {
    // 좌표를 ~100m 단위로 버킷팅해 캐시 히트율 확보 (원본 좌표는 API에 그대로 전달)
    const cacheQuery = {
      ...query,
      mapX: bucketCoord(query.mapX),
      mapY: bucketCoord(query.mapY),
      radius: query.radius ?? 2000,
      size: query.size ?? 20,
      page: query.page ?? 1,
    };
    const key = `tour:nearby:${JSON.stringify(cacheQuery)}`;
    const cached = await this.cache.get<PlacePage>(key);
    if (cached) return cached;

    const data = await this.client.call('locationBasedList2', {
      mapX: query.mapX,
      mapY: query.mapY,
      radius: query.radius ?? 2000,
      contentTypeId: query.contentTypeId,
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      lclsSystm3: query.lclsSystm3,
      arrange: 'E', // 거리순
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = this.toPage(data);
    await this.cache.set(key, page, LIST_TTL);
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
    const cached = await this.cache.get<PlaceDetail>(key);
    if (cached) {
      await this.recordDetailView(cached.placeId);
      return cached;
    }

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
    await this.recordDetailView(detail.placeId);
    await this.cache.set(key, detail, DETAIL_TTL);
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
    const cached = await this.cache.get<{
      data: RelatedPlaceCard[];
      meta: { total: number; page: number; size: number; source: string };
    }>(key);
    if (cached) return cached;

    const detail = await this.detail(contentId, contentTypeId);

    try {
      const related = await this.relatedByKeyword(detail, size);
      if (related.data.length > 0) {
        await this.cache.set(key, related, LIST_TTL);
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
    await this.cache.set(key, fallback, LIST_TTL);
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
  ): Promise<{
    data: HubPlaceCard[];
    meta: { total: number; baseYm: string };
  }> {
    const baseYm = query.baseYm ?? latestBaseYm();
    const key = `tour:hub:${areaCd}:${query.signguCd}:${baseYm}:${query.size ?? 20}`;
    const cached = await this.cache.get<{
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
    await this.cache.set(key, page, LIST_TTL);
    return page;
  }

  /** 지역별 방문자수 (DataLabService). */
  async visitors(query: VisitorsQueryDto): Promise<{
    data: VisitorStat[];
    meta: { total: number; page: number; size: number; level: string };
  }> {
    const key = `tour:visitors:${JSON.stringify(query)}`;
    const cached = await this.cache.get<{
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
    await this.cache.set(key, page, LIST_TTL);
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
    const cached = await this.cache.get<{
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

    const data = await this.client.callService('cnctr', 'tatsCnctrRatedList', {
      areaCd,
      signguCd,
      numOfRows: 100,
      pageNo: 1,
    });

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
    await this.cache.set(key, result, LIST_TTL);
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
    const cached = await this.cache.get<Page<FestivalCard>>(key);
    if (cached) return cached;

    const data = await this.client.call('searchFestival2', {
      eventStartDate,
      eventEndDate: query.eventEndDate,
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      lclsSystm3: query.lclsSystm3,
      arrange: query.arrange ?? 'O',
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = {
      data: extractItems(data).map(toFestivalCard),
      meta: extractBodyMeta(data),
    };
    await this.cache.set(key, page, LIST_TTL);
    return page;
  }

  /** 숙박 (searchStay2, contentTypeId 32 고정). */
  async stays(query: StayQueryDto): Promise<PlacePage> {
    const key = `tour:stay:${JSON.stringify(query)}`;
    const cached = await this.cache.get<PlacePage>(key);
    if (cached) return cached;

    const data = await this.client.call('searchStay2', {
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      lclsSystm3: query.lclsSystm3,
      arrange: query.arrange ?? 'O',
      numOfRows: query.size ?? 20,
      pageNo: query.page ?? 1,
    });

    const page = this.toPage(data);
    await this.cache.set(key, page, LIST_TTL);
    return page;
  }

  /** 동기화용 목록 (areaBasedSyncList2). 배치·캐시 갱신용, showFlag/modifiedTime 포함. */
  async sync(query: SyncQueryDto): Promise<Page<SyncPlaceCard>> {
    const data = await this.client.call('areaBasedSyncList2', {
      areaCode: query.areaCode,
      sigunguCode: query.sigunguCode,
      contentTypeId: query.contentTypeId,
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      lclsSystm3: query.lclsSystm3,
      modifiedtime: query.modifiedtime,
      arrange: 'C',
      numOfRows: query.size ?? 100,
      pageNo: query.page ?? 1,
    });

    const places = extractItems(data).map(toSyncCard);
    await this.bulkUpsertTourPlaceCards(places);

    return {
      data: places,
      meta: extractBodyMeta(data),
    };
  }

  /** 반려동물 동반 정보 (detailPetTour2). 미등록이면 null. */
  async petInfo(contentId: string): Promise<PetTourInfo | null> {
    const key = `tour:pet:${contentId}`;
    const cached = await this.cache.get<PetTourInfo | null>(key);
    if (cached !== undefined) return cached;

    const data = await this.client.call('detailPetTour2', { contentId });
    const info = toPetTourInfo(extractItems(data)[0]);
    await this.cache.set(key, info, DETAIL_TTL);
    return info;
  }

  /** 법정동 코드 (ldongCode2). 시도/시군구 필터용. */
  async ldongCodes(query: LdongCodeQueryDto): Promise<CodeItem[]> {
    const key = `tour:ldong:${JSON.stringify(query)}`;
    const cached = await this.cache.get<CodeItem[]>(key);
    if (cached) return cached;

    const data = await this.client.call('ldongCode2', {
      lDongRegnCd: query.lDongRegnCd,
      lDongSignguCd: query.lDongSignguCd,
      numOfRows: query.size ?? 100,
      pageNo: query.page ?? 1,
    });

    const codes = extractItems(data).map(toCodeItem);
    await this.cache.set(key, codes, META_TTL);
    return codes;
  }

  /** 분류체계 코드 (lclsSystmCode2). 카테고리 필터용. */
  async categoryCodes(query: CategoryCodeQueryDto): Promise<CodeItem[]> {
    const key = `tour:lcls:${JSON.stringify(query)}`;
    const cached = await this.cache.get<CodeItem[]>(key);
    if (cached) return cached;

    const data = await this.client.call('lclsSystmCode2', {
      lclsSystm1: query.lclsSystm1,
      lclsSystm2: query.lclsSystm2,
      lclsSystm3: query.lclsSystm3,
      lclsSystmListYn: query.lclsSystmListYn,
      numOfRows: query.size ?? 100,
      pageNo: query.page ?? 1,
    });

    const codes = extractItems(data).map(toCodeItem);
    await this.cache.set(key, codes, META_TTL);
    return codes;
  }

  async categoryCodeTree(): Promise<CategoryCodeTreeItem[]> {
    const key = 'tour:lcls:tree';
    const cached = await this.cache.get<CategoryCodeTreeItem[]>(key);
    if (cached) return cached;

    const data = await this.client.call('lclsSystmCode2', {
      lclsSystmListYn: 'Y',
      numOfRows: 1000,
      pageNo: 1,
    });

    const tree = toCategoryCodeTree(extractItems(data));
    await this.cache.set(key, tree, META_TTL);
    return tree;
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
          areaCode: detail.areaCode ?? undefined,
          sigunguCode: detail.sigunguCode ?? undefined,
          lclsSystm1: detail.lclsSystm1 ?? undefined,
          lclsSystm2: detail.lclsSystm2 ?? undefined,
          lclsSystm3: detail.lclsSystm3 ?? undefined,
          phone: detail.tel ?? undefined,
          placeUrl: detail.homepage ?? undefined,
        },
        $setOnInsert: {
          stats: { ...DEFAULT_PLACE_POPULARITY_STATS },
          popularityScore: 0,
        },
      },
      { upsert: true, new: true },
    );

    return doc._id.toString();
  }

  private async recordTourSearchResults(cards: PlaceCard[]) {
    const placeIds = await this.bulkUpsertTourPlaceCards(cards);
    await this.recordSearchPlaceIds(placeIds);
  }

  private async recordSearchPlaceIds(placeIds: string[]) {
    const ids = [...new Set(placeIds)];
    if (ids.length === 0) return;

    const now = new Date();
    await this.placeModel.bulkWrite(
      ids.map((placeId) => ({
        updateOne: {
          filter: { _id: placeId },
          update: buildPlacePopularityIncrement('searchCount', 1, now),
        },
      })),
      { ordered: false },
    );
  }

  private async recordDetailView(placeId: string | null | undefined) {
    if (!placeId) return;

    await this.placeModel.updateOne(
      { _id: placeId },
      buildPlacePopularityIncrement('detailViewCount'),
    );
  }

  private async bulkUpsertTourPlaceCards(
    cards: PlaceCard[],
  ): Promise<string[]> {
    const validCards = cards.filter(
      (card) => card.id && card.id !== 'undefined',
    );
    if (validCards.length === 0) return [];

    await this.placeModel.bulkWrite(
      validCards.map((card) => ({
        updateOne: {
          filter: { source: 'tour' as const, externalId: card.id },
          update: {
            $set: this.toTourPlaceCardPayload(card),
            $setOnInsert: {
              images: card.thumbnailUrl ? [card.thumbnailUrl] : [],
              description: '',
              stats: { ...DEFAULT_PLACE_POPULARITY_STATS },
              popularityScore: 0,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    const ids = validCards.map((card) => card.id);
    const places = await this.placeModel
      .find({ source: 'tour', externalId: { $in: ids } })
      .select('_id externalId');

    const byExternal = new Map(
      places.map((place) => [String(place.externalId), place._id.toString()]),
    );
    return ids
      .map((id) => byExternal.get(id))
      .filter((id): id is string => Boolean(id));
  }

  private async findStoredTourPlaces(
    query: StoredTourPlaceQuery,
  ): Promise<PlacePage> {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const filter = this.toStoredTourPlaceFilter(query);

    const [places, total] = await Promise.all([
      this.placeModel
        .find(filter)
        .sort({ popularityScore: -1, _id: 1 })
        .skip((page - 1) * size)
        .limit(size),
      this.placeModel.countDocuments(filter),
    ]);

    if (query.keyword?.trim()) {
      await this.recordSearchPlaceIds(
        places.map((place) => place._id.toString()),
      );
    }

    return {
      data: places.map((place) => this.toStoredTourPlaceCard(place)),
      meta: { total, page, size },
    };
  }

  private toStoredTourPlaceFilter(query: StoredTourPlaceQuery) {
    const filter: Record<string, unknown> = { source: 'tour' };

    if (query.keyword?.trim()) {
      filter.$text = { $search: query.keyword.trim() };
    }
    if (query.areaCode) filter.areaCode = query.areaCode;
    if (query.sigunguCode) filter.sigunguCode = query.sigunguCode;
    if (query.contentTypeId) filter.contentTypeId = query.contentTypeId;
    if (query.lclsSystm1) filter.lclsSystm1 = query.lclsSystm1;
    if (query.lclsSystm2) filter.lclsSystm2 = query.lclsSystm2;
    if (query.lclsSystm3) filter.lclsSystm3 = query.lclsSystm3;

    return filter;
  }

  private toStoredTourPlaceCard(place: PlaceDocument): PlaceCard {
    return {
      id: place.externalId ?? place._id.toString(),
      source: 'TOUR_API',
      contentTypeId: place.contentTypeId ?? 0,
      contentTypeLabel: place.category ?? null,
      lclsSystm1: place.lclsSystm1 ?? null,
      lclsSystm1Name: null,
      lclsSystm2: place.lclsSystm2 ?? null,
      lclsSystm2Name: null,
      lclsSystm3: place.lclsSystm3 ?? null,
      lclsSystm3Name: null,
      name: place.name,
      address: place.address || null,
      areaCode: place.areaCode ?? null,
      sigunguCode: place.sigunguCode ?? null,
      thumbnailUrl: place.images[0] ?? null,
      latitude: place.lat ?? null,
      longitude: place.lng ?? null,
    };
  }

  private toTourPlaceCardPayload(card: PlaceCard) {
    const tags = [
      card.contentTypeLabel,
      card.lclsSystm1Name,
      card.lclsSystm2Name,
      card.lclsSystm3Name,
    ].filter((tag): tag is string => Boolean(tag));

    return {
      source: 'tour' as const,
      externalId: card.id,
      contentTypeId: card.contentTypeId,
      name: card.name,
      address: card.address ?? '',
      lat: card.latitude ?? undefined,
      lng: card.longitude ?? undefined,
      category: card.contentTypeLabel ?? undefined,
      areaCode: card.areaCode ?? undefined,
      sigunguCode: card.sigunguCode ?? undefined,
      lclsSystm1: card.lclsSystm1 ?? undefined,
      lclsSystm2: card.lclsSystm2 ?? undefined,
      lclsSystm3: card.lclsSystm3 ?? undefined,
      tags,
    };
  }
}
