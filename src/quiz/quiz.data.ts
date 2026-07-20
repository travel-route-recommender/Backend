import { TravelType } from '../schemas/user.schema';
import {
  PersonalityAxes,
  PlaceFeatures,
  QuizPreferences,
  QuizResponses,
  ScheduleFeatures,
  ScheduleSlotDraft,
  SpendingCategory,
  StaminaLevel,
} from './quiz.types';

/** 테스트 스텝 메타 (프론트 안내용) */
export const QUIZ_STEPS = [
  {
    id: 'schedule',
    title: '일정 밀도 · 명소/로컬',
    description:
      '반나절 일정표를 자유롭게 채워 주세요. 일정 밀도·명소 필수도·로컬 관심도를 함께 측정합니다.',
  },
  {
    id: 'transport',
    title: '이동 방식',
    description: '선호하는 이동 수단을 복수 선택하고 선호도를 표시해 주세요.',
  },
  {
    id: 'accommodation',
    title: '숙소 스타일',
    description: '각 축에서 본인에게 가까운 쪽을 선택해 주세요.',
  },
  {
    id: 'validation',
    title: '도전 · 안정',
    description: '검증이 덜 된 곳 vs 많이 된 곳 중 어디에 더 끌리나요?',
  },
  {
    id: 'stamina',
    title: '체력 수준',
    description: '여행 중 체력은 어떤 편인가요? (LOW / NORMAL / HIGH)',
  },
  {
    id: 'spending',
    title: '예산 소비 성향',
    description: '코인 100개를 카테고리에 분배해 주세요. 총예산은 묻지 않습니다.',
  },
] as const;

export const SPENDING_CATEGORIES: SpendingCategory[] = [
  'ACCOMMODATION',
  'FOOD',
  'TRANSPORT',
  'TOURISM',
  'ACTIVITY',
  'SHOPPING',
  'CAFE_REST',
];

/** 예산 테스트용 mock 태그 (실데이터 없으면 사용) */
export const MOCK_SPENDING_TAGS = [
  {
    id: 'tag-accommodation',
    category: 'ACCOMMODATION' as SpendingCategory,
    label: '숙소',
    examples: ['호텔', '게스트하우스', '한옥스테이'],
  },
  {
    id: 'tag-food',
    category: 'FOOD' as SpendingCategory,
    label: '음식',
    examples: ['맛집', '로컬식당', '해산물'],
  },
  {
    id: 'tag-transport',
    category: 'TRANSPORT' as SpendingCategory,
    label: '교통',
    examples: ['렌터카', '대중교통', '택시'],
  },
  {
    id: 'tag-tourism',
    category: 'TOURISM' as SpendingCategory,
    label: '관광',
    examples: ['명소', '박물관', '전망대'],
  },
  {
    id: 'tag-activity',
    category: 'ACTIVITY' as SpendingCategory,
    label: '액티비티',
    examples: ['서핑', '트레킹', '원데이클래스'],
  },
  {
    id: 'tag-shopping',
    category: 'SHOPPING' as SpendingCategory,
    label: '쇼핑',
    examples: ['기념품', '시장', '아울렛'],
  },
  {
    id: 'tag-cafe',
    category: 'CAFE_REST' as SpendingCategory,
    label: '카페·휴식',
    examples: ['카페', '베이커리', '힐링스팟'],
  },
];

const TRAVEL_TYPES: Record<string, TravelType> = {
  relaxedLocal: {
    name: '여유로운 로컬형',
    description:
      '빡빡한 명소 순례보다, 천천히 로컬 장소를 깊게 즐기는 스타일이에요.',
    tags: ['로컬', '카페', '산책', '여유로운코스'],
    warning: '알찬 일정·장거리 이동은 피하는 것이 좋아요.',
    emoji: '🌿',
  },
  landmarkExplorer: {
    name: '알찬 명소 탐험형',
    description:
      '대표 명소를 빠짐없이 보고, 일정을 밀도 있게 채우는 스타일이에요.',
    tags: ['명소', '관광', '액티비티', '알찬코스'],
    warning: '너무 느슨한 일정은 아쉽게 느껴질 수 있어요.',
    emoji: '🗺️',
  },
  adventurous: {
    name: '도전적인 탐험가',
    description:
      '검증이 덜 된 곳에도 관심이 많고, 새로운 경험을 우선하는 스타일이에요.',
    tags: ['숨은명소', '액티비티', '로컬', '도전'],
    warning: '리뷰가 적은 장소가 일정에 섞일 수 있어요.',
    emoji: '🔥',
  },
  balanced: {
    name: '균형 잡힌 여행자',
    description:
      '명소와 로컬, 여유와 밀도 사이에서 균형을 찾는 스타일이에요.',
    tags: ['명소', '로컬', '카페', '맛집'],
    warning: '일정이 한쪽으로 치우치면 불만족할 수 있어요.',
    emoji: '⚖️',
  },
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function extractFeaturesFromSchedule(
  slots: ScheduleSlotDraft[],
): { scheduleFeatures: ScheduleFeatures; placeFeatures: PlaceFeatures } {
  if (!slots.length) {
    return {
      scheduleFeatures: {
        scheduleSpanMinutes: 0,
        scheduledMinutes: 0,
        activityMinutes: 0,
        restMinutes: 0,
        freeTimeMinutes: 0,
        placeCount: 0,
        restBlockCount: 0,
        averageStayMinutes: 0,
      },
      placeFeatures: {
        selectedPlaceCount: 0,
        selectedLandmarkCount: 0,
        selectedLocalPlaceCount: 0,
        averageLandmarkScore: 0,
        averageLocalScore: 0,
        landmarkAllocatedMinutes: 0,
        localAllocatedMinutes: 0,
      },
    };
  }

  const starts = slots.map((s) => s.startMinutes);
  const ends = slots.map((s) => s.endMinutes);
  const spanStart = Math.min(...starts);
  const spanEnd = Math.max(...ends);
  const scheduleSpanMinutes = Math.max(0, spanEnd - spanStart);

  let activityMinutes = 0;
  let restMinutes = 0;
  let freeTimeMinutes = 0;
  let placeCount = 0;
  let restBlockCount = 0;
  let landmarkAllocatedMinutes = 0;
  let localAllocatedMinutes = 0;
  let landmarkCount = 0;
  let localCount = 0;
  let landmarkScoreSum = 0;
  let localScoreSum = 0;

  for (const slot of slots) {
    const duration = Math.max(0, slot.endMinutes - slot.startMinutes);
    if (slot.kind === 'PLACE') {
      activityMinutes += duration;
      placeCount += 1;
      const landmark = slot.landmarkScore ?? 50;
      const local = slot.localScore ?? 50;
      landmarkScoreSum += landmark;
      localScoreSum += local;
      if (landmark >= local) {
        landmarkCount += 1;
        landmarkAllocatedMinutes += duration;
      } else {
        localCount += 1;
        localAllocatedMinutes += duration;
      }
    } else if (slot.kind === 'REST') {
      restMinutes += duration;
      restBlockCount += 1;
    } else {
      freeTimeMinutes += duration;
    }
  }

  const scheduledMinutes = activityMinutes + restMinutes;
  const averageStayMinutes =
    placeCount > 0 ? Math.round(activityMinutes / placeCount) : 0;

  return {
    scheduleFeatures: {
      scheduleSpanMinutes,
      scheduledMinutes,
      activityMinutes,
      restMinutes,
      freeTimeMinutes,
      placeCount,
      restBlockCount,
      averageStayMinutes,
    },
    placeFeatures: {
      selectedPlaceCount: placeCount,
      selectedLandmarkCount: landmarkCount,
      selectedLocalPlaceCount: localCount,
      averageLandmarkScore:
        placeCount > 0 ? Math.round(landmarkScoreSum / placeCount) : 0,
      averageLocalScore:
        placeCount > 0 ? Math.round(localScoreSum / placeCount) : 0,
      landmarkAllocatedMinutes,
      localAllocatedMinutes,
    },
  };
}

export function computePersonalityAxes(
  responses: QuizResponses,
): PersonalityAxes {
  let scheduleFeatures = responses.scheduleFeatures;
  let placeFeatures = responses.placeFeatures;

  if (responses.scheduleDraft?.length) {
    const extracted = extractFeaturesFromSchedule(responses.scheduleDraft);
    scheduleFeatures = scheduleFeatures ?? extracted.scheduleFeatures;
    placeFeatures = placeFeatures ?? extracted.placeFeatures;
  }

  const span = scheduleFeatures?.scheduleSpanMinutes || 1;
  const scheduled = scheduleFeatures?.scheduledMinutes ?? 0;
  const densityRatio = scheduled / span;
  const scheduleDensity = clamp(densityRatio * 100);

  const landmarkMin = placeFeatures?.landmarkAllocatedMinutes ?? 0;
  const localMin = placeFeatures?.localAllocatedMinutes ?? 0;
  const placeTotal = landmarkMin + localMin || 1;
  const landmarkNecessity = clamp((landmarkMin / placeTotal) * 100);
  const localInterest = clamp((localMin / placeTotal) * 100);

  let challenging = responses.challenging;
  if (challenging == null && responses.placeValidationPreference) {
    challenging =
      responses.placeValidationPreference === 'LESS_VALIDATED' ? 75 : 25;
  }
  challenging = clamp(challenging ?? 50);

  return {
    scheduleDensity,
    landmarkNecessity,
    localInterest,
    challenging,
  };
}

export function deriveTravelType(axes: PersonalityAxes): TravelType {
  if (axes.challenging >= 65 && axes.scheduleDensity >= 55) {
    return TRAVEL_TYPES.adventurous;
  }
  if (axes.scheduleDensity >= 65 && axes.landmarkNecessity >= 55) {
    return TRAVEL_TYPES.landmarkExplorer;
  }
  if (axes.scheduleDensity <= 45 && axes.localInterest >= 55) {
    return TRAVEL_TYPES.relaxedLocal;
  }
  return TRAVEL_TYPES.balanced;
}

export function buildPreferences(
  responses: QuizResponses,
  axes: PersonalityAxes,
): QuizPreferences {
  let scheduleFeatures = responses.scheduleFeatures;
  let placeFeatures = responses.placeFeatures;
  if (responses.scheduleDraft?.length) {
    const extracted = extractFeaturesFromSchedule(responses.scheduleDraft);
    scheduleFeatures = scheduleFeatures ?? extracted.scheduleFeatures;
    placeFeatures = placeFeatures ?? extracted.placeFeatures;
  }

  return {
    transportPreferences: responses.transportPreferences,
    accommodationPreference: responses.accommodationPreference,
    placeValidationPreference: responses.placeValidationPreference,
    challenging: axes.challenging,
    staminaLevel: responses.staminaLevel,
    spendingAllocation: responses.spendingAllocation,
    scheduleFeatures,
    placeFeatures,
  };
}

/** 나이·이동 제약으로 체력 레벨을 보정 (표시용 메타) */
export function resolveStaminaLevel(input: {
  staminaLevel?: StaminaLevel;
  birthYear?: number;
  age?: number;
  mobilityConstraints?: string[];
}): { staminaLevel: StaminaLevel; staminaScore: number } {
  const base =
    input.staminaLevel === 'HIGH' ? 80 : input.staminaLevel === 'LOW' ? 30 : 55;

  let age = input.age;
  if (age == null && input.birthYear) {
    age = new Date().getFullYear() - input.birthYear;
  }

  let score = base;
  if (age != null) {
    if (age >= 60) score -= 15;
    else if (age >= 45) score -= 8;
    else if (age <= 25) score += 5;
  }

  const constraints = input.mobilityConstraints ?? [];
  score -= constraints.length * 8;
  score = clamp(score);

  let staminaLevel: StaminaLevel = 'NORMAL';
  if (score >= 70) staminaLevel = 'HIGH';
  else if (score <= 40) staminaLevel = 'LOW';

  return { staminaLevel, staminaScore: score };
}

export function countAnsweredSteps(responses: QuizResponses): number {
  let n = 0;
  if (responses.scheduleDraft?.length || responses.scheduleFeatures) n += 1;
  if (responses.transportPreferences) n += 1;
  if (responses.accommodationPreference) n += 1;
  if (
    responses.placeValidationPreference != null ||
    responses.challenging != null
  ) {
    n += 1;
  }
  if (responses.staminaLevel) n += 1;
  if (responses.spendingAllocation) n += 1;
  return n;
}

/** @deprecated 레거시 8문항용 — rooms 매칭은 travelType.tags 사용 */
export function calculateTravelType(answers: Record<string, string>): TravelType {
  let aCount = 0;
  let bCount = 0;
  for (const value of Object.values(answers)) {
    if (value.endsWith('_a')) aCount += 1;
    else if (value.endsWith('_b')) bCount += 1;
  }
  if (bCount >= aCount + 2) return TRAVEL_TYPES.relaxedLocal;
  if (aCount >= bCount + 2) return TRAVEL_TYPES.landmarkExplorer;
  return TRAVEL_TYPES.balanced;
}

export function calculateMatchResult(
  types: Array<{ name: string; tags: string[] } | undefined>,
) {
  const valid = types.filter(Boolean) as Array<{ name: string; tags: string[] }>;
  if (valid.length < 2) {
    return {
      compatibilityScore: 0,
      matchingAreas: [],
      adjustmentAreas: [],
      avoidAreas: [],
      summary: '동행자 정보가 부족합니다.',
    };
  }

  const [a, b] = valid;
  const setA = new Set(a.tags);
  const setB = new Set(b.tags);
  const matching = [...setA].filter((t) => setB.has(t));
  const allTags = new Set([...setA, ...setB]);
  const score = Math.round((matching.length / allTags.size) * 100) || 50;

  return {
    compatibilityScore: score,
    matchingAreas: matching,
    adjustmentAreas: ['일정 밀도', '명소 vs 로컬'],
    avoidAreas: score < 60 ? ['과도한 이동', '액티비티 중심 일정'] : [],
    summary:
      score >= 70
        ? '두 분은 장소 취향이 잘 맞지만, 여행 속도에서 차이가 있을 수 있어요.'
        : '취향 차이가 있어 조율이 필요해요.',
  };
}

export function buildAdjustmentPlan() {
  return {
    aiMessage:
      '두 분 모두 분위기 좋은 장소를 좋아하지만, 일정 밀도는 조금 달라요. ' +
      '오전에는 대표 장소 2곳을 보고, 오후에는 로컬 카페와 산책 시간을 넉넉히 넣어볼게요.',
    summaryPoints: [
      '오전: 핵심 관광지 중심',
      '오후: 여유로운 카페·산책',
      '이동: 가까운 동선 위주',
    ],
  };
}

export function buildCourses(destinationName = '여행지') {
  return [
    {
      id: 'course-1',
      title: `${destinationName} 감성 코스`,
      subtitle: '카페와 산책 중심',
      places: ['해변', '카페 거리', '전망대'],
      tags: ['여유', '사진', '카페'],
      compatibilityScore: 88,
      isRecommended: true,
    },
    {
      id: 'course-2',
      title: `${destinationName} 알차게 코스`,
      subtitle: '맛집과 액티비티',
      places: ['시장', '맛집', '액티비티'],
      tags: ['맛집', '액티비티'],
      compatibilityScore: 75,
      isRecommended: false,
    },
  ];
}

/** 레거시 e2e/프론트 호환: 스텝을 문항 형태로도 노출 */
export const QUIZ_QUESTIONS = QUIZ_STEPS.map((step) => ({
  id: step.id,
  question: step.title,
  category: step.id,
  options: [{ id: `${step.id}_info`, label: step.description }],
}));
