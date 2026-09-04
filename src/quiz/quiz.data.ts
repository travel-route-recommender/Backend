import { TravelType } from '../schemas/user.schema';
import {
  ChallengeStyleType,
  PersonalityAxes,
  QuizPreferences,
  QuizResponses,
  SpendingCategory,
  StaminaLevel,
} from './quiz.types';

/** 테스트 스텝 메타 (프론트 안내용) — 챕터 단위 */
export const QUIZ_STEPS = [
  {
    id: 'challengeStyle',
    title: '도전 · 일정 · 활동',
    description: '도전·안정 성향과 활동 종류·일정 밀도 선호를 측정합니다.',
  },
  {
    id: 'accommodation',
    title: '숙소 스타일',
    description: '숙소 의미·위치/시설·편안함/가격 축을 선택합니다.',
  },
  {
    id: 'stamina',
    title: '체력 수준',
    description: '여행 중 체력 (low / medium / high).',
  },
  {
    id: 'budget',
    title: '예산 우선순위',
    description:
      '숙소·음식·액티비티·쇼핑·이동 5개 항목의 우선순위만 정합니다. (코인 분배 없음)',
  },
  {
    id: 'discovery',
    title: '명소 · 로컬',
    description: '명소 필수도와 로컬 관심도를 측정합니다.',
  },
] as const;

export const BUDGET_RANK_ITEMS = [
  'stay',
  'food',
  'activity',
  'shopping',
  'mobility',
] as const;

/** 예산 선호 입력에 사용하는 제품 분류 체계 */
export const SPENDING_CATEGORIES: SpendingCategory[] = [
  'ACCOMMODATION',
  'FOOD',
  'TRANSPORT',
  'TOURISM',
  'ACTIVITY',
  'SHOPPING',
  'CAFE_REST',
];

/** 예산 선호 화면의 고정 선택지 */
export const SPENDING_TAGS = [
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
  challenge_executor: {
    name: '도전 실행형',
    description:
      '새로운 경험과 변화를 적극적으로 찾고, 일정도 밀도 있게 밀어붙이는 스타일이에요.',
    tags: ['도전', '액티비티', '알찬코스', '탐험'],
    warning: '너무 안전한 코스만 있으면 심심할 수 있어요.',
    emoji: '🔥',
  },
  cautious_explorer: {
    name: '신중한 탐험가',
    description:
      '탐험은 좋아하지만 안정감도 챙기는 스타일이에요. 검증과 새로움 사이에서 균형을 봐요.',
    tags: ['탐험', '명소', '로컬', '균형'],
    warning: '극단적으로 빡센 일정이나 과도한 모험은 부담될 수 있어요.',
    emoji: '🧭',
  },
  stable_planner: {
    name: '안정 계획형',
    description:
      '검증된 곳과 여유 있는 페이스를 선호하고, 예측 가능한 여행을 즐기는 스타일이에요.',
    tags: ['안정', '계획', '여유로운코스', '명소'],
    warning: '즉흥·미검증 장소가 많으면 불편할 수 있어요.',
    emoji: '📋',
  },
  /** 레거시 매칭 폴백 */
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
    description: '명소와 로컬, 여유와 밀도 사이에서 균형을 찾는 스타일이에요.',
    tags: ['명소', '로컬', '카페', '맛집'],
    warning: '일정이 한쪽으로 치우치면 불만족할 수 있어요.',
    emoji: '⚖️',
  },
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** FE 산출 점수를 여행방 공유용 4축으로 매핑 */
export function computePersonalityAxes(
  responses: QuizResponses,
): PersonalityAxes {
  const scheduleDensity = clamp(
    responses.challengeStyle?.scheduleStyle?.score ??
      responses.challengeStyle?.scheduleStyle?.components?.density ??
      50,
  );
  const landmarkNecessity = clamp(
    responses.discovery?.scores?.landmarkImportance ?? 50,
  );
  const localInterest = clamp(responses.discovery?.scores?.localInterest ?? 50);
  const scores = responses.challengeStyle?.scores;
  const challenging = clamp(
    scores
      ? (scores.opennessToVariety +
          scores.excitementSeeking +
          scores.exploration) /
          3
      : 50,
  );

  return {
    scheduleDensity,
    landmarkNecessity,
    localInterest,
    challenging,
  };
}

export function deriveTravelType(
  axes: PersonalityAxes,
  challengeType?: ChallengeStyleType,
): TravelType {
  if (challengeType && TRAVEL_TYPES[challengeType]) {
    return TRAVEL_TYPES[challengeType];
  }
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

export function buildPreferences(responses: QuizResponses): QuizPreferences {
  return {
    surveyVersion: responses.surveyVersion,
    algorithmVersion: responses.algorithmVersion,
    challengeStyleType: responses.challengeStyle?.type,
    scheduleStyleType: responses.challengeStyle?.scheduleStyle?.type,
    challengeScores: responses.challengeStyle?.scores,
    scheduleStyle: responses.challengeStyle?.scheduleStyle,
    itineraryPreference: responses.challengeStyle?.itineraryPreference,
    accommodation: responses.accommodation?.scores,
    stamina: responses.stamina,
    budgetRanking: responses.budget?.ranking,
    discovery: responses.discovery?.scores,
  };
}

/** 나이·이동 제약으로 체력 레벨을 보정 (표시용 메타) */
export function resolveStaminaLevel(input: {
  staminaLevel?: StaminaLevel;
  staminaScore?: number;
  birthYear?: number;
  age?: number;
  mobilityConstraints?: string[];
}): { staminaLevel: StaminaLevel; staminaScore: number } {
  const base =
    input.staminaScore != null
      ? input.staminaScore
      : input.staminaLevel === 'HIGH'
        ? 80
        : input.staminaLevel === 'LOW'
          ? 30
          : 55;

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

  // FE가 level을 명시했으면 우선 사용하되 score는 보정값 유지
  if (input.staminaLevel) {
    return { staminaLevel: input.staminaLevel, staminaScore: score };
  }

  return { staminaLevel, staminaScore: score };
}

export function countAnsweredSteps(responses: QuizResponses): number {
  let n = 0;
  if (responses.challengeStyle?.type) n += 1;
  if (responses.accommodation?.scores) n += 1;
  if (responses.stamina?.level) n += 1;
  if (responses.budget?.ranking?.length === 5) n += 1;
  if (responses.discovery?.scores) n += 1;
  return n;
}

export function areAllStepsAnswered(responses: QuizResponses): boolean {
  return countAnsweredSteps(responses) >= QUIZ_STEPS.length;
}

export function missingSteps(responses: QuizResponses): string[] {
  const missing: string[] = [];
  if (!responses.challengeStyle?.type) missing.push('challengeStyle');
  if (!responses.accommodation?.scores) missing.push('accommodation');
  if (!responses.stamina?.level) missing.push('stamina');
  if (responses.budget?.ranking?.length !== 5) missing.push('budget');
  if (!responses.discovery?.scores) missing.push('discovery');
  return missing;
}

/** @deprecated 레거시 8문항용 — rooms 매칭은 travelType.tags 사용 */
export function calculateTravelType(
  answers: Record<string, string>,
): TravelType {
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
  const valid = types.filter(Boolean) as Array<{
    name: string;
    tags: string[];
  }>;
  if (valid.length < 2) {
    return {
      available: false,
      compatibilityScore: null,
      matchingAreas: [],
      adjustmentAreas: [],
      avoidAreas: [],
      summary: '동행자 정보가 부족합니다.',
      memberCount: valid.length,
      pairCount: 0,
      evaluatedPairCount: 0,
      dataCoverage: 0,
    };
  }

  const pairScores: number[] = [];
  const matchingTagCounts = new Map<string, number>();
  const tagMemberCounts = new Map<string, number>();
  for (const type of valid) {
    for (const tag of new Set(type.tags)) {
      tagMemberCounts.set(tag, (tagMemberCounts.get(tag) ?? 0) + 1);
    }
  }

  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const setA = new Set(valid[i].tags);
      const setB = new Set(valid[j].tags);
      const matching = [...setA].filter((t) => setB.has(t));
      const allTags = new Set([...setA, ...setB]);
      if (allTags.size > 0) {
        pairScores.push(Math.round((matching.length / allTags.size) * 100));
      }
      for (const tag of matching) {
        matchingTagCounts.set(tag, (matchingTagCounts.get(tag) ?? 0) + 1);
      }
    }
  }

  const compatibilityScore = pairScores.length
    ? Math.round(pairScores.reduce((a, b) => a + b, 0) / pairScores.length)
    : null;
  const matchingAreas = [...matchingTagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)
    .slice(0, 8);

  return {
    available: compatibilityScore != null,
    compatibilityScore,
    matchingAreas,
    adjustmentAreas: [...tagMemberCounts.entries()]
      .filter(([, count]) => count > 0 && count < valid.length)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 8),
    avoidAreas: [],
    summary:
      compatibilityScore == null
        ? '비교할 선호 태그가 없어 점수를 계산하지 않았습니다.'
        : `${valid.length}명의 선호 태그를 모든 조합으로 비교한 결과입니다.`,
    memberCount: valid.length,
    pairCount: (valid.length * (valid.length - 1)) / 2,
    evaluatedPairCount: pairScores.length,
    dataCoverage: pairScores.length / ((valid.length * (valid.length - 1)) / 2),
  };
}

/** 레거시 e2e/프론트 호환: 스텝을 문항 형태로도 노출 */
export const QUIZ_QUESTIONS = QUIZ_STEPS.map((step) => ({
  id: step.id,
  question: step.title,
  category: step.id,
  options: [{ id: `${step.id}_info`, label: step.description }],
}));
