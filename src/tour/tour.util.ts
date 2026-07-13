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
  name: string;
  address: string | null;
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

export function toPlaceCard(raw: Record<string, string>): PlaceCard {
  const contentTypeId = Number(raw.contenttypeid);
  return {
    id: String(raw.contentid),
    source: 'TOUR_API',
    contentTypeId,
    contentTypeLabel: CONTENT_TYPE_LABELS[contentTypeId] ?? null,
    name: raw.title ?? '',
    address: [raw.addr1, raw.addr2].filter(Boolean).join(' ') || null,
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

/** Minimal in-memory TTL cache. Swap for Redis later without touching callers. */
type CacheEntry = { value: unknown; expiresAt: number };
const store = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}
