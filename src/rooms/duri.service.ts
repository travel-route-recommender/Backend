import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AnalysisReport,
  AnalysisReportDocument,
} from '../schemas/analysis-report.schema';
import { RoomsService } from './rooms.service';
import { OptimizeDto, ReplacePlaceDto } from './dto/room.dto';

@Injectable()
export class DuriService {
  constructor(
    @InjectModel(AnalysisReport.name)
    private reportModel: Model<AnalysisReportDocument>,
    private roomsService: RoomsService,
  ) {}

  async generateAnalysisReport(roomId: string, userId: string) {
    await this.roomsService.getRoom(roomId, userId);
    const schedule = await this.roomsService.getSchedule(roomId, userId);
    const items = schedule.days.flatMap((d) => d.items);

    const report = await this.reportModel.create({
      roomId,
      routeAnalysis: {
        totalDistance: items.length * 2.5,
        segments: items.map((item, idx) => ({
          from: items[idx - 1]?.placeName ?? 'start',
          to: item.placeName,
          km: 2.5,
        })),
        warnings:
          items.length > 6
            ? ['하루 일정이 다소 빡빡할 수 있어요.']
            : [],
      },
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
      suggestions: [
        {
          type: 'reorder',
          message: '인접한 장소끼리 묶으면 이동 시간을 줄일 수 있어요.',
        },
      ],
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
}
