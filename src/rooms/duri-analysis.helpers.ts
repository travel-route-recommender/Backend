import { timeToMinutes } from './schedule.validation';

const MINUTES_PER_CALENDAR_DAY = 24 * 60;

export type DuriRouteItem = {
  id: string;
  placeName: string;
  startTime: string;
  endTime: string;
  day: number;
};

export type DuriRouteDay<T extends DuriRouteItem = DuriRouteItem> = {
  day: number;
  items: T[];
};

/** DAY 경계를 넘는 가짜 이동 구간을 만들지 않는다. */
export function buildAdjacentPairsByDay<T extends DuriRouteItem>(
  days: DuriRouteDay<T>[],
) {
  return days.flatMap((day) =>
    day.items.slice(1).map((to, index) => ({
      day: day.day,
      from: day.items[index],
      to,
    })),
  );
}

export type DuriScheduleOverlap = {
  day: number;
  firstItemId: string;
  secondItemId: string;
  overlapMinutes: number;
};

const compareTimedItems = (left: DuriRouteItem, right: DuriRouteItem) =>
  timeToMinutes(left.startTime) - timeToMinutes(right.startTime) ||
  timeToMinutes(left.endTime) - timeToMinutes(right.endTime) ||
  left.id.localeCompare(right.id);

/**
 * 겹친 구간은 한 번만 세어 관측 구간 내 실제 점유시간을 계산한다.
 * 일정은 [start, end) 반개구간이므로 끝과 다음 시작이 같은 경우는 겹침이 아니다.
 */
export function buildScheduleDensity(days: DuriRouteDay[]) {
  return {
    method: 'union_occupied_minutes_over_calendar_day',
    scoreBasisMinutes: MINUTES_PER_CALENDAR_DAY,
    byDay: [...days]
      .sort((left, right) => left.day - right.day)
      .map((day) => {
        const intervals = [...day.items]
          .sort(compareTimedItems)
          .map((item) => ({
            start: timeToMinutes(item.startTime),
            end: timeToMinutes(item.endTime),
          }));
        const first = intervals[0];
        const lastEnd = intervals.reduce(
          (maximum, interval) => Math.max(maximum, interval.end),
          first?.end ?? 0,
        );
        const spanMinutes = first ? lastEnd - first.start : 0;
        let occupiedMinutes = 0;
        let unionStart: number | undefined;
        let unionEnd: number | undefined;
        for (const interval of intervals) {
          if (unionStart === undefined || unionEnd === undefined) {
            unionStart = interval.start;
            unionEnd = interval.end;
          } else if (interval.start <= unionEnd) {
            unionEnd = Math.max(unionEnd, interval.end);
          } else {
            occupiedMinutes += unionEnd - unionStart;
            unionStart = interval.start;
            unionEnd = interval.end;
          }
        }
        if (unionStart !== undefined && unionEnd !== undefined) {
          occupiedMinutes += unionEnd - unionStart;
        }
        const freeMinutesWithinSpan = Math.max(
          0,
          spanMinutes - occupiedMinutes,
        );
        return {
          day: day.day,
          score:
            occupiedMinutes > 0
              ? Math.min(
                  100,
                  Math.round(
                    (occupiedMinutes / MINUTES_PER_CALENDAR_DAY) * 1000,
                  ) / 10,
                )
              : 0,
          itemCount: day.items.length,
          occupiedMinutes,
          freeMinutesWithinSpan,
          spanMinutes,
          message:
            day.items.length === 0
              ? '배치된 일정이 없습니다.'
              : `총 ${occupiedMinutes}분 일정, 일정 사이 여유 ${freeMinutesWithinSpan}분입니다.`,
        };
      }),
  };
}

/** 모든 실제 중첩 쌍을 시작시각·종료시각·ID 순으로 결정적으로 반환한다. */
export function findScheduleOverlaps(
  days: DuriRouteDay[],
): DuriScheduleOverlap[] {
  const overlaps: DuriScheduleOverlap[] = [];
  for (const day of [...days].sort((left, right) => left.day - right.day)) {
    const sorted = [...day.items].sort(compareTimedItems);
    let active: DuriRouteItem[] = [];
    for (const current of sorted) {
      const currentStart = timeToMinutes(current.startTime);
      const currentEnd = timeToMinutes(current.endTime);
      active = active.filter(
        (item) => timeToMinutes(item.endTime) > currentStart,
      );
      for (const previous of active) {
        const overlapMinutes =
          Math.min(timeToMinutes(previous.endTime), currentEnd) - currentStart;
        if (overlapMinutes > 0) {
          overlaps.push({
            day: day.day,
            firstItemId: previous.id,
            secondItemId: current.id,
            overlapMinutes,
          });
        }
      }
      active.push(current);
    }
  }
  return overlaps;
}
