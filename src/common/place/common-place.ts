/**
 * TourAPI / Kakao / Mongo 장소를 프론트가 하나로 소비하기 위한 공통 카드 형식.
 *
 * - 목록·검색·후보·저장 place 필드는 이 스키마를 쓴다.
 * - Tour 전용 상세 확장(gallery, intro 등)은 CommonPlace 위에 얹는다.
 * - 후보 추가: placeId(있으면) 또는 externalId + source==='tour' → tourContentId
 */

export type PlaceSource = 'tour' | 'kakao' | 'manual';

export type CommonPlace = {
  /** 리스트 키. placeId가 있으면 그것, 없으면 `${source}:${externalId}` */
  id: string;
  /** Mongo places._id. Tour 목록은 상세/upsert 전엔 null */
  placeId: string | null;
  /** Tour contentId 또는 Kakao place id */
  externalId: string;
  source: PlaceSource;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  thumbnailUrl: string | null;
  /** 이미지 URL 배열 (항상 string). Tour 상세의 메타는 gallery 참고 */
  images: string[];
  category: string | null;
  /** Tour contentTypeId. Kakao/manual은 null */
  contentTypeId: number | null;
  contentTypeLabel: string | null;
  tags: string[];
  phone: string | null;
  placeUrl: string | null;
  description: string | null;
  distanceMeters?: number;
};

export function placeClientId(
  source: PlaceSource,
  externalId: string,
  placeId?: string | null,
): string {
  return placeId || `${source}:${externalId}`;
}

type MongoPlaceLike = {
  _id: { toString(): string } | string;
  externalId?: string;
  source?: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  images?: string[];
  description?: string;
  tags?: string[];
  category?: string;
  contentTypeId?: number;
  phone?: string;
  placeUrl?: string;
};

const CONTENT_TYPE_LABELS: Record<number, string> = {
  12: '관광지',
  14: '문화시설',
  15: '행사/공연/축제',
  25: '여행코스',
  28: '레포츠',
  32: '숙박',
  38: '쇼핑',
  39: '음식점',
};

export function fromMongoPlace(doc: MongoPlaceLike): CommonPlace {
  const placeId = typeof doc._id === 'string' ? doc._id : doc._id.toString();
  const source: PlaceSource =
    doc.source === 'tour' || doc.source === 'kakao' || doc.source === 'manual'
      ? doc.source
      : 'manual';
  const externalId = doc.externalId || placeId;
  const images = doc.images ?? [];
  const contentTypeId =
    doc.contentTypeId != null && Number.isFinite(doc.contentTypeId)
      ? doc.contentTypeId
      : null;

  return {
    id: placeClientId(source, externalId, placeId),
    placeId,
    externalId,
    source,
    name: doc.name,
    address: doc.address || null,
    lat: doc.lat ?? null,
    lng: doc.lng ?? null,
    thumbnailUrl: images[0] ?? null,
    images,
    category: doc.category ?? null,
    contentTypeId,
    contentTypeLabel: contentTypeId
      ? (CONTENT_TYPE_LABELS[contentTypeId] ?? null)
      : null,
    tags: doc.tags ?? [],
    phone: doc.phone ?? null,
    placeUrl: doc.placeUrl ?? null,
    description: doc.description || null,
  };
}
