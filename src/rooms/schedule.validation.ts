import { BadRequestException } from '@nestjs/common';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function assertHhMm(value: string, field: string) {
  if (!HH_MM.test(value)) {
    throw new BadRequestException(`${field}는 HH:mm 형식이어야 합니다.`);
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
    throw new BadRequestException('startTime은 endTime보다 이전이어야 합니다.');
  }
}

/** 여행 기간(일수). 날짜 없으면 null */
export function tripDayCount(startDate?: Date, endDate?: Date): number | null {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (diff < 0) return null;
  return diff + 1;
}

export function assertValidDay(
  day: number,
  startDate?: Date,
  endDate?: Date,
) {
  if (!Number.isInteger(day) || day < 1) {
    throw new BadRequestException('day는 1 이상의 정수여야 합니다.');
  }
  const maxDay = tripDayCount(startDate, endDate);
  if (maxDay != null && day > maxDay) {
    throw new BadRequestException(
      `day는 여행 기간(1~${maxDay}일) 안에 있어야 합니다.`,
    );
  }
  if (maxDay == null && day > 30) {
    throw new BadRequestException('day는 30을 초과할 수 없습니다.');
  }
}
