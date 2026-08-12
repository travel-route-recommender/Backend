import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { AppCacheService } from '../common/cache/app-cache.service';
import { fromMongoPlace } from '../common/place/common-place';
import { Place, PlaceDocument } from '../schemas/place.schema';

const KAKAO_SEARCH_TTL = 5 * 60 * 1000; // 5m

@Injectable()
export class PlacesService {
  constructor(
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    private config: ConfigService,
    private readonly cache: AppCacheService,
  ) {}

  async search(query: {
    q?: string;
    category?: string;
    lat?: number;
    lng?: number;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const kakaoKey = this.config.get<string>('KAKAO_REST_API_KEY');

    if (query.q && kakaoKey) {
      const cacheKey = `places:v2:kakao:${JSON.stringify({
        q: query.q,
        page,
        limit,
        lat: query.lat != null ? AppCacheService.bucketCoord(query.lat) : null,
        lng: query.lng != null ? AppCacheService.bucketCoord(query.lng) : null,
      })}`;

      const cached = await this.cache.get<{
        data: ReturnType<typeof fromMongoPlace>[];
        meta: { total: number; page: number; limit: number };
      }>(cacheKey);
      if (cached) return cached;

      try {
        const { data } = await axios.get(
          'https://dapi.kakao.com/v2/local/search/keyword.json',
          {
            headers: { Authorization: `KakaoAK ${kakaoKey}` },
            params: {
              query: query.q,
              page,
              size: limit,
              x: query.lng,
              y: query.lat,
            },
          },
        );

        const documents = (data.documents ?? []) as Record<string, string>[];
        const places = await this.bulkUpsertKakaoPlaces(documents);
        const result = {
          data: places.map((p) => fromMongoPlace(p!)),
          meta: {
            total: data.meta?.total_count ?? places.length,
            page,
            limit,
          },
        };
        await this.cache.set(cacheKey, result, KAKAO_SEARCH_TTL);
        return result;
      } catch {
        // fall through to local search
      }
    }

    const filter: Record<string, unknown> = {};
    if (query.q) filter.$text = { $search: query.q };
    if (query.category) filter.category = query.category;

    const [data, total] = await Promise.all([
      this.placeModel
        .find(filter)
        .sort({ popularityScore: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.placeModel.countDocuments(filter),
    ]);

    return {
      data: data.map((p) => fromMongoPlace(p)),
      meta: { total, page, limit },
    };
  }

  async findById(id: string) {
    const place = await this.placeModel.findById(id);
    if (!place) throw new NotFoundException('Place not found');
    return fromMongoPlace(place);
  }

  async findSimilar(placeId: string) {
    const doc = await this.placeModel.findById(placeId);
    if (!doc) throw new NotFoundException('Place not found');

    const filter: Record<string, unknown> = {
      _id: { $ne: doc._id },
    };

    if (doc.tags.length > 0) {
      filter.tags = { $in: doc.tags };
    } else if (doc.category) {
      filter.category = doc.category;
    }

    let similar = await this.placeModel
      .find(filter)
      .sort({ popularityScore: -1 })
      .limit(10);

    if (similar.length === 0) {
      similar = await this.placeModel
        .find({ _id: { $ne: doc._id } })
        .sort({ popularityScore: -1 })
        .limit(10);
    }

    return similar.map((p) => fromMongoPlace(p));
  }

  async seedPopularPlaces() {
    const count = await this.placeModel.countDocuments();
    if (count > 0) return;

    await this.placeModel.insertMany([
      {
        name: '제주 성산일출봉',
        address: '제주특별자치도 서귀포시 성산읍',
        lat: 33.458,
        lng: 126.942,
        tags: ['자연', '바다', '사진스팟'],
        category: '관광',
        description: '유네스코 세계자연유산',
        popularityScore: 100,
        source: 'manual',
      },
      {
        name: '부산 해운대',
        address: '부산광역시 해운대구',
        lat: 35.158,
        lng: 129.16,
        tags: ['바다', '해변'],
        category: '관광',
        description: '대표 해변',
        popularityScore: 95,
        source: 'manual',
      },
      {
        name: '경주 불국사',
        address: '경상북도 경주시',
        lat: 35.789,
        lng: 129.332,
        tags: ['문화', '역사'],
        category: '관광',
        description: '신라 대표 사찰',
        popularityScore: 90,
        source: 'manual',
      },
      {
        name: '강릉 안목해변',
        address: '강원특별자치도 강릉시',
        lat: 37.773,
        lng: 128.955,
        tags: ['바다', '카페'],
        category: '관광',
        description: '커피거리',
        popularityScore: 85,
        source: 'manual',
      },
    ]);
  }

  /** Kakao 검색 결과 N건을 한 번에 upsert */
  private async bulkUpsertKakaoPlaces(documents: Record<string, string>[]) {
    if (documents.length === 0) return [];

    const ops = documents.map((doc) => {
      const externalId = doc.id;
      const payload = {
        externalId,
        source: 'kakao' as const,
        name: doc.place_name,
        address: doc.address_name ?? doc.road_address_name ?? '',
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        category: doc.category_name,
        phone: doc.phone,
        placeUrl: doc.place_url,
        tags: doc.category_name?.split(' > ') ?? [],
      };
      return {
        updateOne: {
          filter: { externalId, source: 'kakao' as const },
          update: { $set: payload },
          upsert: true,
        },
      };
    });

    await this.placeModel.bulkWrite(ops, { ordered: false });

    const ids = documents.map((d) => d.id);
    const places = await this.placeModel.find({
      source: 'kakao',
      externalId: { $in: ids },
    });

    const byExternal = new Map(
      places.map((p) => [String(p.externalId), p] as const),
    );
    return ids.map((id) => byExternal.get(id)).filter(Boolean);
  }
}
