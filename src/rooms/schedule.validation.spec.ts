import { BadRequestException } from '@nestjs/common';
import {
  assertTimeRange,
  assertYmd,
  resolveItemDayAndDate,
} from './schedule.validation';

describe('schedule validation', () => {
  it('윤년 날짜는 허용하고 정규식만 통과하는 잘못된 날짜는 거부한다', () => {
    expect(() => assertYmd('2028-02-29', 'date')).not.toThrow();
    expect(() => assertYmd('2027-02-29', 'date')).toThrow(BadRequestException);
    expect(() => assertYmd('2026-02-30', 'date')).toThrow(BadRequestException);
  });

  it('1분 일정은 허용하되 역전/동일 시간은 거부한다', () => {
    expect(() => assertTimeRange('10:00', '10:01')).not.toThrow();
    expect(() => assertTimeRange('10:00', '10:00')).toThrow();
    expect(() => assertTimeRange('10:01', '10:00')).toThrow();
  });

  it('date로부터 DAY를 정확히 파생하고 여행 범위를 벗어나면 거부한다', () => {
    const startDate = new Date('2026-08-19T00:00:00.000Z');
    const endDate = new Date('2026-08-21T00:00:00.000Z');
    expect(
      resolveItemDayAndDate({ date: '2026-08-20', startDate, endDate }),
    ).toEqual({ day: 2, date: '2026-08-20' });
    expect(() =>
      resolveItemDayAndDate({ date: '2026-08-22', startDate, endDate }),
    ).toThrow();
  });
});
