import { BadRequestException } from '@nestjs/common';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function assertHhMm(value: string, field: string) {
  if (!HH_MM.test(value)) {
    throw new BadRequestException(`${field}는 HH:mm 형식이어야 합니다.`);
  }
}

export function assertYmd(value: string, field: string) {
  if (!YMD.test(value)) {
    throw new BadRequestException(`${field}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${field}가 유효한 날짜가 아닙니다.`);
  }
}

export function assertTimeZone(value: string, field = 'timezone') {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
  } catch {
    throw new BadRequestException(`${field}이 올바른 IANA 시간대가 아닙니다.`);
  }
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function assertTimeRange(startTime: string, endTime: string) {
  assertHhMm(startTime, 'startTime');
  assertHhMm(endTime, 'endTime');
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new BadRequestException(
      '일정 종료 시간은 시작 시간보다 늦어야 합니다.',
    );
  }
}

/** 여행 기간(일수). 날짜 없으면 null */
export function tripDayCount(startDate?: Date, endDate?: Date): number | null {
  if (!startDate || !endDate) return null;
  const start = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (diff < 0) return null;
  return diff + 1;
}

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function toYmd(d: Date): string {
  const x = startOfUtcDay(d);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** startDate + (day-1) → YYYY-MM-DD */
export function dayToDate(startDate: Date, day: number): string {
  const x = startOfUtcDay(startDate);
  x.setUTCDate(x.getUTCDate() + (day - 1));
  return toYmd(x);
}

/** YYYY-MM-DD → 1-based day from startDate */
export function dateToDay(startDate: Date, date: string): number {
  assertYmd(date, 'date');
  const start = startOfUtcDay(startDate);
  const target = new Date(`${date}T00:00:00.000Z`);
  const diff = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  return diff + 1;
}

export function assertValidDay(day: number, startDate?: Date, endDate?: Date) {
  if (!Number.isInteger(day) || day < 1) {
    throw new BadRequestException('DAY 번호는 1 이상의 정수여야 합니다.');
  }
  const maxDay = tripDayCount(startDate, endDate);
  if (maxDay != null && day > maxDay) {
    throw new BadRequestException(
      `day는 여행 기간(1~${maxDay}일) 안에 있어야 합니다.`,
    );
  }
  if (maxDay == null && day > 30) {
    throw new BadRequestException(
      '여행 일정은 최대 30일차까지 만들 수 있습니다.',
    );
  }
}

export function resolveItemDayAndDate(opts: {
  day?: number;
  date?: string;
  startDate?: Date;
  endDate?: Date;
}): { day: number; date?: string } {
  const { startDate, endDate } = opts;

  if (opts.date) {
    assertYmd(opts.date, 'date');
    if (!startDate) {
      throw new BadRequestException(
        'date를 쓰려면 여행방 startDate가 먼저 설정되어야 합니다.',
      );
    }
    const day = dateToDay(startDate, opts.date);
    assertValidDay(day, startDate, endDate);
    return { day, date: opts.date };
  }

  const day = opts.day ?? 1;
  assertValidDay(day, startDate, endDate);
  const date = startDate ? dayToDate(startDate, day) : undefined;
  return { day, date };
}

type TimedItem = {
  id: string;
  startTime: string;
  endTime: string;
};

/** 같은 day 내 시간 겹침 거부 (반개구간 [start, end)) */
export function assertNoOverlap(items: TimedItem[]) {
  const sorted = [...items].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (timeToMinutes(cur.startTime) < timeToMinutes(prev.endTime)) {
      throw new BadRequestException({
        code: 'SCHEDULE_OVERLAP',
        message: `일정이 겹칩니다: ${prev.id} (${prev.startTime}–${prev.endTime})와 ${cur.id} (${cur.startTime}–${cur.endTime})`,
        items: [prev.id, cur.id],
      });
    }
  }
}
