import {
  buildAdjacentPairsByDay,
  buildScheduleDensity,
  findScheduleOverlaps,
} from './duri-analysis.helpers';

const scheduleItem = (id: string, day: number) => ({
  id,
  day,
  placeName: id,
  startTime: '10:00',
  endTime: '11:00',
});

describe('Duri day route boundaries', () => {
  it('서로 다른 DAY의 마지막/첫 일정을 이동 구간으로 연결하지 않는다', () => {
    const pairs = buildAdjacentPairsByDay([
      { day: 1, items: [scheduleItem('a', 1), scheduleItem('b', 1)] },
      { day: 2, items: [scheduleItem('c', 2), scheduleItem('d', 2)] },
    ]);
    expect(pairs.map((pair) => `${pair.from.id}->${pair.to.id}`)).toEqual([
      'a->b',
      'c->d',
    ]);
  });

  it('빈 DAY와 한 개 일정 DAY는 경로 요청을 만들지 않는다', () => {
    expect(
      buildAdjacentPairsByDay([
        { day: 1, items: [] },
        { day: 2, items: [scheduleItem('only', 2)] },
      ]),
    ).toEqual([]);
  });
});

describe('Duri density and overlap analysis', () => {
  const timedItem = (id: string, startTime: string, endTime: string) => ({
    id,
    day: 1,
    placeName: id,
    startTime,
    endTime,
  });

  it('겹친 체류 구간을 한 번만 세고 달력 하루 기준 점유율을 계산한다', () => {
    const result = buildScheduleDensity([
      {
        day: 1,
        items: [
          timedItem('long', '09:00', '12:00'),
          timedItem('inside', '10:00', '11:00'),
          timedItem('tail', '11:00', '13:00'),
        ],
      },
    ]);

    expect(result.method).toBe('union_occupied_minutes_over_calendar_day');
    expect(result.scoreBasisMinutes).toBe(24 * 60);
    expect(result.byDay[0]).toMatchObject({
      score: 16.7,
      occupiedMinutes: 240,
      freeMinutesWithinSpan: 0,
      spanMinutes: 240,
    });
  });

  it('15분 일정 하나를 꽉 찬 하루로 판정하지 않는다', () => {
    const result = buildScheduleDensity([
      { day: 1, items: [timedItem('short', '10:00', '10:15')] },
    ]);

    expect(result.byDay[0]).toMatchObject({
      score: 1,
      occupiedMinutes: 15,
      spanMinutes: 15,
    });
  });

  it('긴 구간과 뒤 일정의 비인접 중첩까지 정확하고 결정적으로 찾는다', () => {
    const days = [
      {
        day: 1,
        items: [
          timedItem('c', '11:00', '13:00'),
          timedItem('a', '09:00', '12:00'),
          timedItem('b', '10:00', '11:00'),
        ],
      },
    ];

    expect(findScheduleOverlaps(days)).toEqual([
      {
        day: 1,
        firstItemId: 'a',
        secondItemId: 'b',
        overlapMinutes: 60,
      },
      {
        day: 1,
        firstItemId: 'a',
        secondItemId: 'c',
        overlapMinutes: 60,
      },
    ]);
    expect(
      findScheduleOverlaps([{ day: 1, items: [...days[0].items].reverse() }]),
    ).toEqual(findScheduleOverlaps(days));
  });
});
