import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { Place, PlaceDocument } from '../schemas/place.schema';

@Injectable()
export class PlacesService {
  constructor(
    @InjectModel(Place.name) private placeModel: Model<PlaceDocument>,
    private config: ConfigService,
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

        const documents = data.documents ?? [];
        const places = await Promise.all(
          documents.map((doc: Record<string, string>) =>
            this.upsertKakaoPlace(doc),
          ),
        );

        return {
          data: places,
          meta: { total: data.meta?.total_count ?? places.length, page, limit },
        };
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

    return { data, meta: { total, page, limit } };
  }

  async findById(id: string) {
    const place = await this.placeModel.findById(id);
    if (!place) throw new NotFoundException('Place not found');
    return place;
  }

  async findSimilar(placeId: string) {
    const place = await this.findById(placeId);
    const filter: Record<string, unknown> = {
      _id: { $ne: place._id },
    };

    if (place.tags.length > 0) {
      filter.tags = { $in: place.tags };
    } else if (place.category) {
      filter.category = place.category;
    }

    const similar = await this.placeModel
      .find(filter)
      .sort({ popularityScore: -1 })
      .limit(10);

    if (similar.length > 0) return similar;

    return this.placeModel
      .find({ _id: { $ne: place._id } })
      .sort({ popularityScore: -1 })
      .limit(10);
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

  private async upsertKakaoPlace(doc: Record<string, string>) {
    const externalId = doc.id;
    const existing = await this.placeModel.findOne({
      externalId,
      source: 'kakao',
    });

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

    if (existing) {
      Object.assign(existing, payload);
      return existing.save();
    }

    return this.placeModel.create(payload);
  }
}
