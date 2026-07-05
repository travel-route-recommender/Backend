export const QUIZ_QUESTIONS = [
  {
    id: 'q1',
    question: '여행 첫날 아침, 더 끌리는 쪽은?',
    category: '일정 밀도',
    options: [
      { id: 'q1_a', label: '8시부터 알차게 출발' },
      { id: 'q1_b', label: '느긋하게 준비하고 11시 출발' },
    ],
  },
  {
    id: 'q2',
    question: '이동 수단은 어떤 게 더 편해요?',
    category: '이동 선호',
    options: [
      { id: 'q2_a', label: '걸어서 천천히 둘러보기' },
      { id: 'q2_b', label: '차로 빠르게 이동하기' },
    ],
  },
  {
    id: 'q3',
    question: '점심 시간, 더 선호하는 건?',
    category: '맛집',
    options: [
      { id: 'q3_a', label: '웨이팅 있어도 유명 맛집' },
      { id: 'q3_b', label: '분위기 좋은 조용한 카페' },
    ],
  },
  {
    id: 'q4',
    question: '여행지에서 가장 중요한 건?',
    category: '취향',
    options: [
      { id: 'q4_a', label: '예쁜 풍경과 사진' },
      { id: 'q4_b', label: '새로운 경험과 체험' },
    ],
  },
  {
    id: 'q5',
    question: '저녁 시간은 어떻게 보내고 싶어요?',
    category: '일정 밀도',
    options: [
      { id: 'q5_a', label: '야경과 야시장 탐방' },
      { id: 'q5_b', label: '숙소에서 푹 쉬기' },
    ],
  },
  {
    id: 'q6',
    question: '숙소 선택 기준은?',
    category: '휴식',
    options: [
      { id: 'q6_a', label: '위치와 접근성' },
      { id: 'q6_b', label: '분위기와 인테리어' },
    ],
  },
  {
    id: 'q7',
    question: '함께 가면 좋은 장소는?',
    category: '취향',
    options: [
      { id: 'q7_a', label: '바다와 해변' },
      { id: 'q7_b', label: '산과 자연' },
    ],
  },
  {
    id: 'q8',
    question: '여행 중 예상치 못한 상황이 생기면?',
    category: '유연성',
    options: [
      { id: 'q8_a', label: '계획대로 진행하고 싶어요' },
      { id: 'q8_b', label: '그때그때 바꿔도 괜찮아요' },
    ],
  },
];

const TRAVEL_TYPES = {
  relaxed: {
    name: '감성 여유형 여행자',
    description:
      '많은 장소를 빠르게 방문하기보다, 분위기 좋은 장소에서 오래 머무는 여행을 선호해요.',
    tags: ['바다', '카페', '산책', '사진스팟', '여유로운코스'],
    warning: '긴 이동과 빡빡한 일정은 피하는 것이 좋아요.',
    emoji: '🌊',
  },
  explorer: {
    name: '알차게 즐기는 탐험형',
    description:
      '새로운 장소를 빠르게 둘러보고, 맛집과 액티비티를 함께 즐기는 스타일이에요.',
    tags: ['맛집', '액티비티', '문화', '바다'],
    warning: '너무 느슨한 일정은 지루하게 느껴질 수 있어요.',
    emoji: '🗺️',
  },
  balanced: {
    name: '균형 잡힌 여행자',
    description:
      '여유와 탐험 사이에서 균형을 찾으며, 다양한 경험을 골고루 즐기는 스타일이에요.',
    tags: ['카페', '맛집', '문화', '산책'],
    warning: '일정이 너무 많거나 너무 적으면 불만족할 수 있어요.',
    emoji: '⚖️',
  },
};

export function calculateTravelType(answers: Record<string, string>) {
  let aCount = 0;
  let bCount = 0;

  for (const value of Object.values(answers)) {
    if (value.endsWith('_a')) aCount += 1;
    else if (value.endsWith('_b')) bCount += 1;
  }

  if (bCount >= aCount + 2) return TRAVEL_TYPES.relaxed;
  if (aCount >= bCount + 2) return TRAVEL_TYPES.explorer;
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
    adjustmentAreas: ['일정 밀도', '웨이팅 선호도'],
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
      '두 분 모두 바다와 카페를 좋아하지만, 일정 속도는 조금 달라요. ' +
      '오전에는 대표 장소 2곳을 보고, 오후에는 카페와 산책 시간을 넉넉히 넣어볼게요.',
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
