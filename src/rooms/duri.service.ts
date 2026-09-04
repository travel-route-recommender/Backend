import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  AnalysisReport,
  AnalysisReportDocument,
} from '../schemas/analysis-report.schema';
import { Place, PlaceDocument } from '../schemas/place.schema';
import { MobilityService } from '../mobility/mobility.service';
import { RoomsService } from './rooms.service';
import { timeToMinutes } from './schedule.validation';
import {
  buildAdjacentPairsByDay,
  buildScheduleDensity,
  findScheduleOverlaps,
} from './duri-analysis.helpers';

type Coord = { lat: number; lng: number };
type ReportItem = {
  id: string;
  placeName: string;
  startTime: string;
  endTime: string;
  day: number;
  date?: string | null;
  placeId?: Types.ObjectId | string | null;
  lat?: number | null;
  lng?: number | null;
  tags?: string[];
};
type ReportDay = { day: number; items: ReportItem[] };
type RouteResult = {
  available: boolean;
  reason?: string;
  totalDistance: number;
  totalDurationSeconds: number;
  knownSegmentCount: number;
  unknownSegmentCount: number;
  segments: Record<string, unknown>[];
  warnings: string[];
};

const ANALYSIS_VERSION = 'evidence-v2';

@Injectable()
export class DuriService {
  private readonly logger = new Logger(DuriService.name);
  private readonly inFlightReports = new Map<string, Promise<unknown>>();

  constructor(
    @InjectModel(AnalysisReport.name)
    private reportModel: Model<AnalysisReportDocument>,
    @InjectModel(Place.name)
    private placeModel: Model<PlaceDocument>,
    private roomsService: RoomsService,
    private mobilityService: MobilityService,
    private config: ConfigService,
  ) {}

  async generateAnalysisReport(roomId: string, userId: string) {
    const key = `${roomId}:${userId}`;
    const inFlight = this.inFlightReports.get(key);
    if (inFlight) return inFlight;
    const task = this.generateAnalysisReportOnce(roomId, userId);
    this.inFlightReports.set(key, task);
    try {
      return await task;
    } finally {
      if (this.inFlightReports.get(key) === task) {
        this.inFlightReports.delete(key);
      }
    }
  }

  private async generateAnalysisReportOnce(roomId: string, userId: string) {
    // Capture one coherent optimistic snapshot. Fetching these three reads in
    // parallel can label an older schedule with newer room versions when a
    // write lands between them.
    let baseline!: Awaited<ReturnType<RoomsService['getAnalysisBaseline']>>;
    let schedule!: Awaited<ReturnType<RoomsService['getSchedule']>>;
    let preferences!: Awaited<ReturnType<RoomsService['getMemberPreferences']>>;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      baseline = await this.roomsService.getAnalysisBaseline(roomId, userId);
      [schedule, preferences] = await Promise.all([
        this.roomsService.getSchedule(roomId, userId),
        this.roomsService.getMemberPreferences(roomId, userId),
      ]);
      if (
        schedule.scheduleVersion === baseline.scheduleVersion &&
        preferences.scheduleVersion === baseline.scheduleVersion &&
        preferences.factsVersion === baseline.factsVersion
      ) {
        break;
      }
      if (attempt === 2) {
        throw new ConflictException({
          code: 'ANALYSIS_INPUT_CHANGED',
          message:
            '분석 중 일정이나 의견이 계속 변경되고 있습니다. 잠시 후 다시 분석해 주세요.',
          currentScheduleVersion: preferences.scheduleVersion,
          currentFactsVersion: preferences.factsVersion,
        });
      }
    }
    const existing = await this.reportModel
      .findOne({
        roomId: new Types.ObjectId(roomId),
        scheduleVersion: baseline.scheduleVersion,
        factsVersion: baseline.factsVersion,
        analysisVersion: ANALYSIS_VERSION,
        createdAt: { $gte: this.reportFreshAfter() },
      })
      .sort({ createdAt: -1 })
      .exec();
    if (existing) {
      const latestBaseline = await this.roomsService.getAnalysisBaseline(
        roomId,
        userId,
      );
      if (
        latestBaseline.scheduleVersion !== baseline.scheduleVersion ||
        latestBaseline.factsVersion !== baseline.factsVersion
      ) {
        throw new ConflictException({
          code: 'ANALYSIS_INPUT_CHANGED',
          message:
            '분석 결과를 불러오는 동안 일정이나 의견이 변경되었습니다. 다시 분석해 주세요.',
          currentScheduleVersion: latestBaseline.scheduleVersion,
          currentFactsVersion: latestBaseline.factsVersion,
        });
      }
      return existing;
    }
    const days = schedule.days.map((day) => ({
      day: day.day,
      items: [...day.items]
        .map((item) => ({ ...item, day: item.day ?? day.day }))
        .sort(
          (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
        ),
    })) as ReportDay[];
    const items = days.flatMap((day) => day.items);

    const coordsByItemId = await this.resolveItemCoords(items);
    const routeAnalysis = await this.buildRouteAnalysis(
      days,
      coordsByItemId,
      this.readVersionedString(schedule.planning?.transportMode),
      this.readVersionedNumber(schedule.planning?.travelBufferMinutes),
    );
    const densityAnalysis = this.buildDensityAnalysis(days);
    const conflictAnalysis = this.buildConflictAnalysis(days);
    const placeNames = await this.resolvePlaceNames(
      preferences.candidateSignals.map((candidate) => candidate.placeId),
    );
    const preferenceReflection = this.buildPreferenceReflection(
      items,
      preferences,
      placeNames,
    );

    const latestBaseline = await this.roomsService.getAnalysisBaseline(
      roomId,
      userId,
    );
    if (
      latestBaseline.scheduleVersion !== baseline.scheduleVersion ||
      latestBaseline.factsVersion !== baseline.factsVersion
    ) {
      throw new ConflictException({
        code: 'ANALYSIS_INPUT_CHANGED',
        message: '분석 중 일정이나 의견이 변경되었습니다. 다시 분석해 주세요.',
        currentScheduleVersion: latestBaseline.scheduleVersion,
        currentFactsVersion: latestBaseline.factsVersion,
      });
    }

    const report = await this.reportModel.create({
      roomId: new Types.ObjectId(roomId),
      scheduleVersion: baseline.scheduleVersion,
      factsVersion: baseline.factsVersion,
      analysisVersion: ANALYSIS_VERSION,
      routeAnalysis,
      budgetAnalysis: {
        available: false,
        estimated: null,
        reason: 'cost_data_not_collected',
        breakdown: [],
      },
      densityAnalysis,
      preferenceReflection,
      conflictAnalysis,
      suggestions: this.buildSuggestions(
        routeAnalysis,
        conflictAnalysis.overlaps,
        preferenceReflection.details,
      ),
    });

    await this.pruneOldReports(roomId);

    return report;
  }

  private async pruneOldReports(roomId: string) {
    const keep = this.readBoundedConfig(
      'DURI_REPORT_RETENTION_COUNT',
      20,
      1,
      100,
    );
    try {
      const staleIds = await this.reportModel
        .find({ roomId: new Types.ObjectId(roomId) })
        .sort({ createdAt: -1 })
        .skip(keep)
        .select('_id')
        .lean();
      if (staleIds.length) {
        await this.reportModel.deleteMany({
          _id: { $in: staleIds.map((entry) => entry._id) },
        });
      }
    } catch (error) {
      this.logger.error(
        `오래된 분석 리포트 정리 실패: ${roomId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async getLatestReport(roomId: string, userId: string) {
    if (!Types.ObjectId.isValid(roomId)) {
      throw new BadRequestException({
        code: 'INVALID_IDENTIFIER',
        message: '여행방 식별자 형식이 올바르지 않습니다.',
      });
    }
    const roomObjectId = new Types.ObjectId(roomId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const freshAfter = this.reportFreshAfter();
      const before = await this.roomsService.getAnalysisBaseline(
        roomId,
        userId,
      );
      const currentReport = await this.reportModel
        .findOne({
          roomId: roomObjectId,
          scheduleVersion: before.scheduleVersion,
          factsVersion: before.factsVersion,
          analysisVersion: ANALYSIS_VERSION,
          createdAt: { $gte: freshAfter },
        })
        .sort({ createdAt: -1 })
        .exec();
      const report =
        currentReport ??
        (await this.reportModel
          .findOne({
            roomId: roomObjectId,
            analysisVersion: ANALYSIS_VERSION,
            scheduleVersion: { $exists: true },
            factsVersion: { $exists: true },
          })
          .sort({ createdAt: -1 })
          .exec());
      const after = await this.roomsService.getAnalysisBaseline(roomId, userId);
      if (
        before.scheduleVersion !== after.scheduleVersion ||
        before.factsVersion !== after.factsVersion
      ) {
        continue;
      }
      if (!report) return null;
      const reportCreatedAt = (
        report as AnalysisReportDocument & { createdAt?: Date }
      ).createdAt;
      const evidenceExpired =
        !reportCreatedAt || reportCreatedAt.getTime() < freshAfter.getTime();
      return {
        ...report.toObject(),
        stale:
          evidenceExpired ||
          report.scheduleVersion !== after.scheduleVersion ||
          report.factsVersion !== after.factsVersion,
        evidenceExpired,
        currentScheduleVersion: after.scheduleVersion,
        currentFactsVersion: after.factsVersion,
      };
    }
    throw new ConflictException({
      code: 'ANALYSIS_INPUT_CHANGED',
      message:
        '리포트를 불러오는 동안 일정이나 의견이 변경되었습니다. 잠시 후 다시 시도해 주세요.',
    });
  }

  async reflectPreferences(roomId: string, userId: string) {
    return this.roomsService.getMemberPreferences(roomId, userId);
  }

  private async resolveItemCoords(
    items: ReportItem[],
  ): Promise<Map<string, Coord>> {
    const map = new Map<string, Coord>();
    const missingIds: string[] = [];

    for (const item of items) {
      if (this.isCoordinate(item.lat, item.lng)) {
        map.set(item.id, { lat: item.lat, lng: item.lng! });
      } else if (item.placeId) {
        missingIds.push(item.placeId.toString());
      }
    }

    if (missingIds.length === 0) return map;

    const places = await this.placeModel
      .find({ _id: { $in: [...new Set(missingIds)] } })
      .select('_id lat lng')
      .lean();
    const byId = new Map(places.map((p) => [String(p._id), p] as const));

    for (const item of items) {
      if (map.has(item.id) || !item.placeId) continue;
      const place = byId.get(item.placeId.toString());
      if (place && this.isCoordinate(place.lat, place.lng)) {
        map.set(item.id, { lat: place.lat, lng: place.lng! });
      }
    }

    return map;
  }

  private async resolvePlaceNames(placeIds: string[]) {
    const validIds = [...new Set(placeIds)].filter((id) =>
      Types.ObjectId.isValid(id),
    );
    if (!validIds.length) return new Map<string, string>();
    const places = await this.placeModel
      .find({ _id: { $in: validIds } })
      .select('_id name title')
      .lean();
    return new Map(
      places.map((place) => {
        const value = place as { _id: unknown; name?: string; title?: string };
        return [
          String(value._id),
          value.name ?? value.title ?? '선택한 장소',
        ] as const;
      }),
    );
  }

  private isCoordinate(
    lat: number | null | undefined,
    lng: number | null | undefined,
  ): lat is number {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  }

  private async buildRouteAnalysis(
    days: ReportDay[],
    coordsByItemId: Map<string, Coord>,
    transportMode: string | null,
    travelBufferMinutes: number,
  ): Promise<RouteResult> {
    const pairs = buildAdjacentPairsByDay(days);
    const segments: Record<string, unknown>[] = Array.from(
      { length: pairs.length },
      (): Record<string, unknown> => ({}),
    );
    const warnings: string[] = [];
    const routeBudget = this.readBoundedConfig(
      'DURI_MAX_ROUTE_SEGMENTS',
      24,
      1,
      100,
    );
    const concurrency = this.readBoundedConfig(
      'DURI_ROUTE_CONCURRENCY',
      4,
      1,
      8,
    );
    const deadlineAt =
      Date.now() +
      this.readBoundedConfig(
        'DURI_ANALYSIS_DEADLINE_MS',
        15_000,
        1_000,
        30_000,
      );
    const tasks: Array<{
      index: number;
      pair: (typeof pairs)[number];
      base: Record<string, unknown> & { scheduledGapMinutes: number };
      fromCoord: Coord;
      toCoord: Coord;
    }> = [];

    for (const [index, pair] of pairs.entries()) {
      const scheduledGapMinutes =
        timeToMinutes(pair.to.startTime) - timeToMinutes(pair.from.endTime);
      const base = {
        day: pair.day,
        fromItemId: pair.from.id,
        toItemId: pair.to.id,
        from: pair.from.placeName,
        to: pair.to.placeName,
        scheduledGapMinutes,
      };
      const fromCoord = coordsByItemId.get(pair.from.id);
      const toCoord = coordsByItemId.get(pair.to.id);

      if (transportMode !== 'car') {
        segments[index] = {
          ...base,
          status: 'unknown',
          reason:
            transportMode === 'transit'
              ? 'transit_provider_unavailable'
              : transportMode
                ? 'transport_mode_not_supported_by_car_router'
                : 'transport_mode_missing',
        };
        continue;
      }
      if (!fromCoord || !toCoord) {
        segments[index] = {
          ...base,
          status: 'unknown',
          reason: 'coordinates_missing',
        };
        continue;
      }
      if (tasks.length >= routeBudget) {
        segments[index] = {
          ...base,
          status: 'unknown',
          reason: 'analysis_route_limit',
        };
        continue;
      }
      tasks.push({ index, pair, base, fromCoord, toCoord });
    }

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, tasks.length) },
      async () => {
        while (cursor < tasks.length) {
          const task = tasks[cursor];
          cursor += 1;
          const remainingMs = deadlineAt - Date.now();
          if (remainingMs <= 0) {
            segments[task.index] = {
              ...task.base,
              status: 'unknown',
              reason: 'analysis_deadline_exceeded',
            };
            continue;
          }
          const direction = await this.safeDirectionsBeforeDeadline(
            task.fromCoord,
            task.toCoord,
            remainingMs,
          );
          if (!direction) {
            segments[task.index] = {
              ...task.base,
              status: 'unknown',
              reason:
                Date.now() >= deadlineAt
                  ? 'analysis_deadline_exceeded'
                  : 'directions_unavailable',
            };
            continue;
          }
          const requiredMinutes = Math.ceil(direction.durationSeconds / 60);
          const minimumGapMinutes = requiredMinutes + travelBufferMinutes;
          const shortfallMinutes = Math.max(
            0,
            minimumGapMinutes - task.base.scheduledGapMinutes,
          );
          segments[task.index] = {
            ...task.base,
            status: 'ok',
            distanceMeters: direction.distanceMeters,
            durationSeconds: direction.durationSeconds,
            requiredMinutes,
            configuredBufferMinutes: travelBufferMinutes,
            minimumGapMinutes,
            shortfallMinutes,
            fare: direction.fare,
            source: direction.source,
          };
        }
      },
    );
    await Promise.all(workers);

    const known = segments.filter((segment) => segment.status === 'ok');
    const knownSegmentCount = known.length;
    const unknownSegmentCount = segments.length - knownSegmentCount;
    const totalDistanceMeters = known.reduce(
      (sum, segment) => sum + Number(segment.distanceMeters ?? 0),
      0,
    );
    const totalDurationSeconds = known.reduce(
      (sum, segment) => sum + Number(segment.durationSeconds ?? 0),
      0,
    );
    for (const segment of segments) {
      const shortfallMinutes = Number(segment.shortfallMinutes ?? 0);
      if (segment.status === 'ok' && shortfallMinutes > 0) {
        warnings.push(
          `${String(segment.day)}일차 ${String(segment.from)}에서 ${String(segment.to)}까지 이동 여유가 ${shortfallMinutes}분 부족합니다.`,
        );
      }
    }

    const reason =
      pairs.length === 0
        ? 'no_adjacent_schedule_items'
        : transportMode !== 'car'
          ? transportMode === 'transit'
            ? 'transit_provider_unavailable'
            : 'car_route_not_applicable'
          : knownSegmentCount === 0
            ? 'route_data_unavailable'
            : undefined;
    return {
      available: knownSegmentCount > 0,
      ...(reason ? { reason } : {}),
      totalDistance: Math.round((totalDistanceMeters / 1000) * 10) / 10,
      totalDurationSeconds,
      knownSegmentCount,
      unknownSegmentCount,
      segments,
      warnings,
    };
  }

  private async safeDirectionsBeforeDeadline(
    origin: Coord,
    destination: Coord,
    remainingMs: number,
  ) {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.mobilityService.safeDirections(origin, destination),
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), remainingMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private buildDensityAnalysis(days: ReportDay[]) {
    return buildScheduleDensity(days);
  }

  private buildConflictAnalysis(days: ReportDay[]) {
    return {
      overlaps: findScheduleOverlaps(days),
      closedVenues: [],
      operatingHoursAvailable: false,
      operatingHoursReason: 'verified_operating_hours_not_available',
    };
  }

  private buildPreferenceReflection(
    items: ReportItem[],
    preferences: Awaited<ReturnType<RoomsService['getMemberPreferences']>>,
    placeNames: Map<string, string>,
  ) {
    const scheduledTags = new Set(
      items
        .flatMap((item) => item.tags ?? [])
        .map((tag) => this.normalizeTag(tag)),
    );
    const memberDetails = preferences.members.flatMap((member) => {
      const preferred = new Set(
        [...(member.interestTags ?? []), ...(member.travelType?.tags ?? [])]
          .map((tag) => this.normalizeTag(tag))
          .filter(Boolean),
      );
      if (!preferred.size) return [];
      const matchedTags = [...preferred].filter((tag) =>
        scheduledTags.has(tag),
      );
      return [
        {
          type: 'member_tag_coverage',
          userId: member.userId,
          nickname: member.nickname,
          preferredTagCount: preferred.size,
          matchedTags,
          score: Math.round((matchedTags.length / preferred.size) * 100),
        },
      ];
    });
    const scheduledPlaceIds = new Set(
      items.flatMap((item) => (item.placeId ? [item.placeId.toString()] : [])),
    );
    const signalDetails: Record<string, unknown>[] = [];
    const dedupe = new Set<string>();
    for (const candidate of preferences.candidateSignals) {
      for (const signal of candidate.signals) {
        const type =
          signal.mustVisit === true && !scheduledPlaceIds.has(candidate.placeId)
            ? 'must_visit_missing'
            : signal.avoid === true && scheduledPlaceIds.has(candidate.placeId)
              ? 'avoided_place_scheduled'
              : null;
        if (!type) continue;
        const key = `${type}:${candidate.placeId}:${signal.userId}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        signalDetails.push({
          type,
          placeId: candidate.placeId,
          placeName: placeNames.get(candidate.placeId) ?? '선택한 장소',
          userId: signal.userId,
        });
      }
    }
    const scores = memberDetails.map((detail) => detail.score);
    const representedIds = new Set(
      memberDetails.map((detail) => detail.userId),
    );
    const missingMemberIds = preferences.members
      .map((member) => member.userId)
      .filter((memberId) => !representedIds.has(memberId));
    const memberCount = preferences.members.length;
    const representedMemberCount = representedIds.size;
    const available = scores.length > 0 && scheduledTags.size > 0;
    return {
      available,
      score: available
        ? Math.round(
            scores.reduce((sum, score) => sum + score, 0) / scores.length,
          )
        : null,
      reason:
        scores.length === 0
          ? 'member_preference_tags_missing'
          : scheduledTags.size === 0
            ? 'schedule_tags_missing'
            : undefined,
      method: 'mean_member_preferred_tag_coverage',
      memberCount,
      representedMemberCount,
      missingMemberIds,
      coverageRatio: memberCount > 0 ? representedMemberCount / memberCount : 0,
      confidence:
        representedMemberCount === 0
          ? ('none' as const)
          : representedMemberCount === memberCount
            ? ('complete' as const)
            : ('partial' as const),
      details: [...memberDetails, ...signalDetails],
    };
  }

  private buildSuggestions(
    routeAnalysis: RouteResult,
    overlaps: Record<string, unknown>[],
    preferenceDetails: Record<string, unknown>[],
  ) {
    const suggestions: Array<{
      type: string;
      message: string;
      actionPayload?: Record<string, unknown>;
    }> = routeAnalysis.warnings.map((message) => ({
      type: 'travel_gap',
      message,
    }));
    for (const overlap of overlaps) {
      suggestions.push({
        type: 'overlap',
        message: `${String(overlap.day)}일차에 ${String(overlap.overlapMinutes)}분 겹치는 일정이 있습니다.`,
        actionPayload: overlap,
      });
    }
    for (const detail of preferenceDetails) {
      if (detail.type === 'must_visit_missing') {
        suggestions.push({
          type: 'must_visit_missing',
          message: `${String(detail.placeName)}이 필수 방문 의견에 있지만 일정에 없습니다.`,
          actionPayload: detail,
        });
      } else if (detail.type === 'avoided_place_scheduled') {
        suggestions.push({
          type: 'avoided_place_scheduled',
          message: `${String(detail.placeName)}에 제외 의견이 있어 참여자와 확인이 필요합니다.`,
          actionPayload: detail,
        });
      }
    }
    return suggestions;
  }

  private normalizeTag(value: string) {
    return value.trim().toLocaleLowerCase('ko-KR');
  }

  private readVersionedString(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const raw = (value as { value?: unknown }).value;
    return typeof raw === 'string' ? raw : null;
  }

  private readVersionedNumber(value: unknown): number {
    if (!value || typeof value !== 'object') return 0;
    const raw = (value as { value?: unknown }).value;
    return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
      ? raw
      : 0;
  }

  private readBoundedConfig(
    key: string,
    fallback: number,
    min: number,
    max: number,
  ) {
    const value = Number(this.config.get<string>(key, String(fallback)));
    return Number.isFinite(value)
      ? Math.min(max, Math.max(min, Math.floor(value)))
      : fallback;
  }

  private reportFreshAfter() {
    const ttlMs = this.readBoundedConfig(
      'DURI_REPORT_CACHE_TTL_MS',
      10 * 60 * 1000,
      60 * 1000,
      24 * 60 * 60 * 1000,
    );
    return new Date(Date.now() - ttlMs);
  }
}
