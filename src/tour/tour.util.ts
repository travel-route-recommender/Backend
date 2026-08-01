export const TOUR_CONTENT_TYPE_IDS = [12, 14, 15, 25, 28, 32, 38, 39] as const;
export type TourContentTypeId = (typeof TOUR_CONTENT_TYPE_IDS)[number];

export const CONTENT_TYPE_LABELS: Record<number, string> = {
  12: '관광지',
  14: '문화시설',
  15: '행사/공연/축제',
  25: '여행코스',
  28: '레포츠',
  32: '숙박',
  38: '쇼핑',
  39: '음식점',
};

export type PlaceCard = {
  id: string;
  source: 'TOUR_API';
  contentTypeId: number;
  contentTypeLabel: string | null;
  lclsSystm1: string | null;
  lclsSystm1Name: string | null;
  lclsSystm2: string | null;
  lclsSystm2Name: string | null;
  lclsSystm3: string | null;
  lclsSystm3Name: string | null;
  name: string;
  address: string | null;
  areaCode: string | null;
  sigunguCode: string | null;
  thumbnailUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters?: number;
};

export type PlaceImage = {
  url: string;
  thumbnailUrl?: string;
  name?: string;
};

export type PlaceDetail = PlaceCard & {
  placeId: string | null;
  overview: string | null;
  homepage: string | null;
  tel: string | null;
  /** KorService2 areacode — 특화 API(areaCd) 매핑용 */
  areaCode: string | null;
  /** KorService2 sigungucode — 특화 API(signguCd) 매핑용 (코드 체계 다를 수 있음) */
  sigunguCode: string | null;
  images: PlaceImage[];
  intro: Record<string, unknown>;
  repeatingInfo: Record<string, unknown>[];
};

/** Drop undefined/null/empty values before sending to TourAPI. */
export function clean(
  params: Record<string, string | number | undefined | null>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

/** TourAPI body.items can be "", {}, { item: {} } or { item: [] }. */
export function extractItems(data: unknown): Record<string, string>[] {
  const body = (data as { response?: { body?: { items?: unknown } } })?.response
    ?.body;
  const items = body?.items;
  if (!items || typeof items === 'string') return [];
  const item = (items as { item?: unknown }).item;
  if (!item) return [];
  return (Array.isArray(item) ? item : [item]) as Record<string, string>[];
}

export function extractBodyMeta(data: unknown): {
  total: number;
  page: number;
  size: number;
} {
  const body =
    (
      data as {
        response?: {
          body?: { totalCount?: string; pageNo?: string; numOfRows?: string };
        };
      }
    )?.response?.body ?? {};
  return {
    total: Number(body.totalCount ?? 0),
    page: Number(body.pageNo ?? 1),
    size: Number(body.numOfRows ?? 0),
  };
}

function readRawString(
  raw: Record<string, string>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

export function toPlaceCard(raw: Record<string, string>): PlaceCard {
  const contentTypeId = Number(raw.contenttypeid);
  return {
    id: String(raw.contentid),
    source: 'TOUR_API',
    contentTypeId,
    contentTypeLabel: CONTENT_TYPE_LABELS[contentTypeId] ?? null,
    lclsSystm1: readRawString(raw, ['lclsSystm1', 'lclssystm1']),
    lclsSystm1Name: readRawString(raw, [
      'lclsSystm1Name',
      'lclsSystm1Nm',
      'lclsSystm1nm',
      'lclssystm1name',
      'lclssystm1nm',
    ]),
    lclsSystm2: readRawString(raw, ['lclsSystm2', 'lclssystm2']),
    lclsSystm2Name: readRawString(raw, [
      'lclsSystm2Name',
      'lclsSystm2Nm',
      'lclsSystm2nm',
      'lclssystm2name',
      'lclssystm2nm',
    ]),
    lclsSystm3: readRawString(raw, ['lclsSystm3', 'lclssystm3']),
    lclsSystm3Name: readRawString(raw, [
      'lclsSystm3Name',
      'lclsSystm3Nm',
      'lclsSystm3nm',
      'lclssystm3name',
      'lclssystm3nm',
    ]),
    name: raw.title ?? '',
    address: [raw.addr1, raw.addr2].filter(Boolean).join(' ') || null,
    areaCode: raw.areacode || null,
    sigunguCode: raw.sigungucode || null,
    thumbnailUrl: raw.firstimage2 || raw.firstimage || null,
    latitude: raw.mapy ? Number(raw.mapy) : null,
    longitude: raw.mapx ? Number(raw.mapx) : null,
    ...(raw.dist ? { distanceMeters: Number(raw.dist) } : {}),
  };
}

export function toPlaceImages(rows: Record<string, string>[]): PlaceImage[] {
  return rows
    .filter((r) => r.originimgurl || r.smallimageurl)
    .map((r) => ({
      url: r.originimgurl || r.smallimageurl,
      thumbnailUrl: r.smallimageurl || undefined,
      name: r.imgname || undefined,
    }));
}

export type FestivalCard = PlaceCard & {
  eventStartDate: string | null;
  eventEndDate: string | null;
};

export function toFestivalCard(raw: Record<string, string>): FestivalCard {
  return {
    ...toPlaceCard(raw),
    eventStartDate: raw.eventstartdate || null,
    eventEndDate: raw.eventenddate || null,
  };
}

export type SyncPlaceCard = PlaceCard & {
  showFlag: string | null;
  modifiedTime: string | null;
};

export function toSyncCard(raw: Record<string, string>): SyncPlaceCard {
  return {
    ...toPlaceCard(raw),
    showFlag: raw.showflag || null,
    modifiedTime: raw.modifiedtime || null,
  };
}

/** detailPetTour2: 반려동물 동반 정보. */
export type PetTourInfo = {
  contentId: string;
  acmpyType: string | null; // 동반 유형 (전구역 동반가능 등)
  acmpyAnimal: string | null; // 동반 가능 동물
  needMaterial: string | null; // 필요 준비물
  etcInfo: string | null; // 기타 안내
  facility: string | null; // 구비 시설
  furnishedItems: string | null; // 비치 물품
  rentalItems: string | null; // 대여 물품
  purchaseItems: string | null; // 구매 물품
  accidentRisk: string | null; // 사고 대비사항
};

export function toPetTourInfo(
  raw: Record<string, string> | undefined,
): PetTourInfo | null {
  if (!raw || !raw.contentid) return null;
  const s = (v: string | undefined) => (v ? String(v) : null);
  return {
    contentId: String(raw.contentid),
    acmpyType: s(raw.acmpyTypeCd),
    acmpyAnimal: s(raw.acmpyPsblCpam),
    needMaterial: s(raw.acmpyNeedMtr),
    etcInfo: s(raw.etcAcmpyInfo),
    facility: s(raw.relaPosesFclty),
    furnishedItems: s(raw.relaFrnshPrdlst),
    rentalItems: s(raw.relaRntlPrdlst),
    purchaseItems: s(raw.relaPurcPrdlst),
    accidentRisk: s(raw.relaAcdntRiskMtr),
  };
}

export type CodeItem = { code: string; name: string };

export function toCodeItem(raw: Record<string, string>): CodeItem {
  return { code: String(raw.code ?? ''), name: raw.name ?? '' };
}

export type RegionCodeItem = CodeItem & {
  aliases: string[];
};

export type RegionCodeTreeItem = CodeItem & {
  sigungu: CodeItem[];
};

export type CategoryMiddleCodeItem = CodeItem & {
  children: CodeItem[];
};

export type CategoryCodeTreeItem = CodeItem & {
  children: CategoryMiddleCodeItem[];
};

function readClassificationField(
  raw: Record<string, string>,
  level: 1 | 2 | 3,
  kind: 'code' | 'name',
): string | null {
  const prefix = `lclsSystm${level}`;
  const lowerPrefix = `lclssystm${level}`;
  return kind === 'code'
    ? readRawString(raw, [
        `${prefix}Cd`,
        `${prefix}cd`,
        `${lowerPrefix}cd`,
        prefix,
        lowerPrefix,
      ])
    : readRawString(raw, [
        `${prefix}Nm`,
        `${prefix}nm`,
        `${lowerPrefix}nm`,
        `${prefix}Name`,
        `${lowerPrefix}name`,
      ]);
}

export function toCategoryCodeTree(
  rows: Record<string, string>[],
): CategoryCodeTreeItem[] {
  const largeByCode = new Map<string, CategoryCodeTreeItem>();
  const middleByKey = new Map<string, CategoryMiddleCodeItem>();

  rows.forEach((row) => {
    const largeCode = readClassificationField(row, 1, 'code');
    if (!largeCode) return;
    const largeName = readClassificationField(row, 1, 'name') ?? largeCode;
    let large = largeByCode.get(largeCode);
    if (!large) {
      large = { code: largeCode, name: largeName, children: [] };
      largeByCode.set(largeCode, large);
    } else if (large.name === large.code && largeName !== largeCode) {
      large.name = largeName;
    }

    const middleCode = readClassificationField(row, 2, 'code');
    if (!middleCode) return;
    const middleKey = `${largeCode}:${middleCode}`;
    const middleName = readClassificationField(row, 2, 'name') ?? middleCode;
    let middle = middleByKey.get(middleKey);
    if (!middle) {
      middle = { code: middleCode, name: middleName, children: [] };
      middleByKey.set(middleKey, middle);
      large.children.push(middle);
    } else if (middle.name === middle.code && middleName !== middleCode) {
      middle.name = middleName;
    }

    const smallCode = readClassificationField(row, 3, 'code');
    if (!smallCode) return;
    if (middle.children.some((item) => item.code === smallCode)) return;
    middle.children.push({
      code: smallCode,
      name: readClassificationField(row, 3, 'name') ?? smallCode,
    });
  });

  return [...largeByCode.values()]
    .map((large) => ({
      ...large,
      children: large.children
        .map((middle) => ({
          ...middle,
          children: middle.children.sort((left, right) =>
            left.name.localeCompare(right.name, 'ko'),
          ),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'ko')),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ko'));
}

export const REGION_AREA_CODES: RegionCodeItem[] = [
  { code: '1', name: '서울특별시', aliases: ['서울'] },
  { code: '2', name: '인천광역시', aliases: ['인천'] },
  { code: '3', name: '대전광역시', aliases: ['대전'] },
  { code: '4', name: '대구광역시', aliases: ['대구'] },
  { code: '5', name: '광주광역시', aliases: ['광주'] },
  { code: '6', name: '부산광역시', aliases: ['부산'] },
  { code: '7', name: '울산광역시', aliases: ['울산'] },
  { code: '8', name: '세종특별자치시', aliases: ['세종'] },
  { code: '31', name: '경기도', aliases: ['경기'] },
  { code: '32', name: '강원특별자치도', aliases: ['강원'] },
  { code: '33', name: '충청북도', aliases: ['충북'] },
  { code: '34', name: '충청남도', aliases: ['충남'] },
  { code: '35', name: '경상북도', aliases: ['경북'] },
  { code: '36', name: '경상남도', aliases: ['경남'] },
  { code: '37', name: '전북특별자치도', aliases: ['전북'] },
  { code: '38', name: '전라남도', aliases: ['전남'] },
  { code: '39', name: '제주특별자치도', aliases: ['제주'] },
];

function normalizeRegionKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/특별자치시|특별자치도|광역시|특별시|자치시|자치도/g, '');
}

export function resolveRegionAreaCode(region: string): RegionCodeItem | null {
  const normalized = normalizeRegionKey(region);
  return (
    REGION_AREA_CODES.find((item) => {
      if (item.code === normalized) return true;
      if (normalizeRegionKey(item.name) === normalized) return true;
      return item.aliases.some(
        (alias) => normalizeRegionKey(alias) === normalized,
      );
    }) ?? null
  );
}

export function regionSearchTokens(item: RegionCodeItem): string[] {
  return [item.code, item.name, ...item.aliases]
    .map((value) => normalizeRegionKey(value))
    .filter(Boolean);
}

/** 티맵 연관/중심 데이터는 월 단위. 직전 월 YYYYMM (데이터 지연 고려). */
export function latestBaseYm(now = new Date()): string {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "성산일출봉 [유네스코…]" → "성산일출봉" */
export function cleanPlaceKeyword(name: string): string {
  return name.replace(/\s*\[.*?\]\s*/g, '').trim() || name;
}

export type RelatedPlaceCard = {
  name: string;
  rank: number;
  categoryLarge: string | null;
  categoryMedium: string | null;
  categorySmall: string | null;
  areaName: string | null;
  sigunguName: string | null;
  tatsCode: string | null;
  source: 'RELATED_API' | 'NEARBY_FALLBACK';
} & Partial<Pick<PlaceCard, 'id' | 'contentTypeId' | 'thumbnailUrl' | 'latitude' | 'longitude' | 'address' | 'distanceMeters'>>;

export function toRelatedCard(raw: Record<string, string>): RelatedPlaceCard {
  return {
    name: raw.rlteTatsNm ?? '',
    rank: Number(raw.rlteRank ?? 0),
    categoryLarge: raw.rlteCtgryLclsNm || null,
    categoryMedium: raw.rlteCtgryMclsNm || null,
    categorySmall: raw.rlteCtgrySclsNm || null,
    areaName: raw.rlteRegnNm || null,
    sigunguName: raw.rlteSignguNm || null,
    tatsCode: raw.rlteTatsCd || null,
    source: 'RELATED_API',
  };
}

export type HubPlaceCard = {
  name: string;
  rank: number;
  categoryLarge: string | null;
  categoryMedium: string | null;
  areaName: string | null;
  sigunguName: string | null;
  tatsCode: string | null;
  latitude: number | null;
  longitude: number | null;
  baseYm: string | null;
};

export function toHubCard(raw: Record<string, string>): HubPlaceCard {
  return {
    name: raw.hubTatsNm ?? '',
    rank: Number(raw.hubRank ?? 0),
    categoryLarge: raw.hubCtgryLclsNm || null,
    categoryMedium: raw.hubCtgryMclsNm || null,
    areaName: raw.areaNm || null,
    sigunguName: raw.signguNm || null,
    tatsCode: raw.hubTatsCd || null,
    latitude: raw.mapY ? Number(raw.mapY) : null,
    longitude: raw.mapX ? Number(raw.mapX) : null,
    baseYm: raw.baseYm || null,
  };
}

export type VisitorStat = {
  date: string;
  areaCode?: string | null;
  areaName?: string | null;
  sigunguCode?: string | null;
  sigunguName?: string | null;
  dayOfWeek: string | null;
  visitorType: 'domestic' | 'foreign' | 'other' | 'unknown';
  visitorTypeCode: string | null;
  visitorTypeLabel: string | null;
  count: number;
};

export function toVisitorStat(raw: Record<string, string>): VisitorStat {
  const code = String(raw.touDivCd ?? '');
  // 명세: K=내국인 E=외국인. 실제 DataLab 응답은 1/2/3 코드도 사용.
  let visitorType: VisitorStat['visitorType'] = 'unknown';
  if (code === 'K' || code === '1') visitorType = 'domestic';
  else if (code === 'E' || code === '3') visitorType = 'foreign';
  else if (code === '2') visitorType = 'other'; // 외지인 등
  return {
    date: raw.baseYmd ?? '',
    areaCode: raw.areaCode || null,
    areaName: raw.areaNm || null,
    sigunguCode: raw.signguCode || null,
    sigunguName: raw.signguNm || null,
    dayOfWeek: raw.daywkDivNm || null,
    visitorType,
    visitorTypeCode: code || null,
    visitorTypeLabel: raw.touDivNm || null,
    count: Number(raw.touNum ?? 0),
  };
}

export type CongestionDay = {
  date: string;
  rate: number;
  busy: boolean; // rate >= 60
};

export function toCongestionDay(raw: Record<string, string>): CongestionDay {
  const rate = Number(raw.cnctrRate ?? 0);
  return {
    date: raw.baseYmd ?? '',
    rate,
    busy: rate >= 60,
  };
}

/** nearby 등 좌표 캐시 키용. decimals=3 ≈ 100m 단위 */
export function bucketCoord(value: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
