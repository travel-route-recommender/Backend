import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AnalysisReport,
  AnalysisReportDocument,
} from '../schemas/analysis-report.schema';
import { Place, PlaceDocument } from '../schemas/place.schema';
import { MobilityService } from '../mobility/mobility.service';
import { RoomsService } from './rooms.service';
import { OptimizeDto, ReplacePlaceDto } from './dto/room.dto';

type Coord = { lat: number; lng: number };

@Injectable()
export class DuriService {
  constructor(
    @InjectModel(AnalysisReport.name)
    private reportModel: Model<AnalysisReportDocument>,
    @InjectModel(Place.name)
    private placeModel: Model<PlaceDocument>,
    private roomsService: RoomsService,
    private mobilityService: MobilityService,
  ) {}

  async generateAnalysisReport(roomId: string, userId: string) {
    await this.roomsService.getRoom(roomId, userId);
    const schedule = await this.roomsService.getSchedule(roomId, userId);
    const items = schedule.days.flatMap((d) => d.items);

    const coordsByItemId = await this.resolveItemCoords(items);
    const routeAnalysis = await this.buildRouteAnalysis(items, coordsByItemId);

    const report = await this.reportModel.create({
      roomId,
      routeAnalysis,
      budgetAnalysis: {
        estimated: items.length * 15000,
        breakdown: items.map((i) => ({
          place: i.placeName,
          estimated: 15000,
        })),
      },
      densityAnalysis: {
        byDay: schedule.days.map((d) => ({
          day: d.day,
          score: Math.min(100, d.items.length * 20),
          message:
            d.items.length >= 5
              ? '일정이 꽉 찼어요'
              : d.items.length === 0
                ? '비어 있어요'
                : '적당해요',
        })),
      },
      preferenceReflection: {
        score: 75,
        details: [{ area: '카페', matched: true }],
      },
      conflictAnalysis: { overlaps: [], closedVenues: [] },
      suggestions: this.buildSuggestions(routeAnalysis),
    });

    return report;
  }

  async getLatestReport(roomId: string, userId: string) {
    await this.roomsService.getRoom(roomId, userId);
    return this.reportModel
      .findOne({ roomId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async suggestPlaces(roomId: string, userId: string) {
    const room = await this.roomsService.getRoom(roomId, userId);
    return {
      suggestions: [
        {
          name: `${room.destination?.name ?? '여행지'} 추천 카페`,
          reason: '동행자 성향에 맞는 여유로운 장소',
        },
      ],
    };
  }

  async suggestOrder(roomId: string, userId: string) {
    const schedule = await this.roomsService.getSchedule(roomId, userId);
    const reordered = schedule.days.map((d) => ({
      day: d.day,
      itemIds: [...d.items].reverse().map((i) => i.id),
    }));
    return { suggestedOrder: reordered };
  }

  async fillGaps(roomId: string, userId: string) {
    return {
      fillers: [
        { placeName: '근처 카페', startTime: '15:00', endTime: '16:00' },
      ],
    };
  }

  async replacePlace(
    roomId: string,
    userId: string,
    dto: ReplacePlaceDto,
  ) {
    return {
      itemId: dto.itemId,
      replacement: { placeName: '대체 장소', tags: ['카페'] },
    };
  }

  async reflectPreferences(roomId: string, userId: string) {
    return this.roomsService.getCompatibility(roomId, userId);
  }

  async optimize(roomId: string, userId: string, dto: OptimizeDto) {
    return {
      optimized: true,
      budget: dto.budget,
      minimizeTravel: dto.minimizeTravel ?? true,
      message: '동선을 기준으로 순서를 조정했습니다.',
    };
  }

  async generateDraft(roomId: string, userId: string) {
    const room = await this.roomsService.getRoom(roomId, userId);
    return {
      days: [
        {
          day: 1,
          items: [
            {
              id: 'draft-1',
              placeName: `${room.destination?.name ?? '여행지'} 대표 spot`,
              startTime: '10:00',
              endTime: '12:00',
              tags: ['관광'],
              reason: '두리 초안',
              priority: 'must',
            },
          ],
        },
      ],
    };
  }

  private async resolveItemCoords(
    items: Array<{
      id: string;
      placeId?: Types.ObjectId | string | null;
      lat?: number | null;
      lng?: number | null;
    }>,
  ): Promise<Map<string, Coord>> {
    const map = new Map<string, Coord>();
    const missingIds: string[] = [];

    for (const item of items) {
      if (
        typeof item.lat === 'number' &&
        typeof item.lng === 'number' &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng)
      ) {
        map.set(item.id, { lat: item.lat, lng: item.lng });
      } else if (item.placeId) {
        missingIds.push(item.placeId.toString());
      }
    }

    if (missingIds.length === 0) return map;

    const places = await this.placeModel
      .find({ _id: { $in: missingIds } })
      .select('_id lat lng')
      .lean();
    const byId = new Map(
      places.map((p) => [String(p._id), p] as const),
    );

    for (const item of items) {
      if (map.has(item.id) || !item.placeId) continue;
      const place = byId.get(item.placeId.toString());
      if (
        place &&
        typeof place.lat === 'number' &&
        typeof place.lng === 'number'
      ) {
        map.set(item.id, { lat: place.lat, lng: place.lng });
      }
    }

    return map;
  }

  private async buildRouteAnalysis(
    items: Array<{ id: string; placeName: string }>,
    coordsByItemId: Map<string, Coord>,
  ) {
    const segments: Record<string, unknown>[] = [];
    let totalDistanceMeters = 0;
    let totalDurationSeconds = 0;
    let unknownCount = 0;

    for (let i = 1; i < items.length; i++) {
      const from = items[i - 1];
      const to = items[i];
      const fromCoord = coordsByItemId.get(from.id);
      const toCoord = coordsByItemId.get(to.id);

      if (!fromCoord || !toCoord) {
        unknownCount += 1;
        segments.push({
          from: from.placeName,
          to: to.placeName,
          status: 'unknown',
          reason: 'coordinates_missing',
        });
        continue;
      }

      const dir = await this.mobilityService.safeDirections(
        fromCoord,
        toCoord,
      );

      if (!dir) {
        unknownCount += 1;
        segments.push({
          from: from.placeName,
          to: to.placeName,
          status: 'unknown',
          reason: 'directions_unavailable',
          fromCoord,
          toCoord,
        });
        continue;
      }

      totalDistanceMeters += dir.distanceMeters;
      totalDurationSeconds += dir.durationSeconds;
      segments.push({
        from: from.placeName,
        to: to.placeName,
        status: 'ok',
        distanceMeters: dir.distanceMeters,
        durationSeconds: dir.durationSeconds,
        km: Math.round((dir.distanceMeters / 1000) * 10) / 10,
        fare: dir.fare,
        source: dir.source,
      });
    }

    const warnings: string[] = [];
    if (items.length > 6) {
      warnings.push('하루 일정이 다소 빡빡할 수 있어요.');
    }
    if (totalDurationSeconds >= 2 * 60 * 60) {
      warnings.push(
        `이동만 약 ${Math.round(totalDurationSeconds / 60)}분 예상돼요. 동선을 줄여보세요.`,
      );
    }
    if (unknownCount > 0) {
      warnings.push(
        `${unknownCount}개 구간의 이동시간을 계산하지 못했어요 (좌표 없음 또는 길찾기 실패).`,
      );
    }

    return {
      totalDistance: Math.round((totalDistanceMeters / 1000) * 10) / 10,
      totalDurationSeconds,
      segments,
      warnings,
    };
  }

  private buildSuggestions(routeAnalysis: {
    totalDurationSeconds: number;
    segments: Record<string, unknown>[];
  }) {
    const suggestions: Array<{ type: string; message: string }> = [];
    if (routeAnalysis.totalDurationSeconds >= 90 * 60) {
      suggestions.push({
        type: 'reorder',
        message: '인접한 장소끼리 묶으면 이동 시간을 줄일 수 있어요.',
      });
    } else if (routeAnalysis.segments.length > 0) {
      suggestions.push({
        type: 'route',
        message: '현재 동선 기준으로 이동시간을 계산했어요.',
      });
    }
    return suggestions;
  }
}
