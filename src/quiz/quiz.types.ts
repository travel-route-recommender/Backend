/** 도전 유형 (FE 산출) */
export type ChallengeStyleType =
  | 'challenge_executor'
  | 'cautious_explorer'
  | 'stable_planner';

export type ScheduleStyleType = 'packed' | 'relaxed';

export type ItinerarySentiment = 'like' | 'neutral' | 'dislike';

export type BudgetRankItem =
  | 'stay'
  | 'food'
  | 'activity'
  | 'shopping'
  | 'mobility';

export type StaminaAnswer = 'low' | 'medium' | 'high';
export type StaminaLevel = 'LOW' | 'NORMAL' | 'HIGH';

export type ChallengeStyleScores = {
  opennessToVariety: number;
  excitementSeeking: number;
  cautiousness: number;
  exploration: number;
};

export type ScheduleStyleComponents = {
  density: number;
  activeRestPreference: number;
  stamina: number;
};

export type ScheduleStyle = {
  type: ScheduleStyleType;
  score: number;
  components: ScheduleStyleComponents;
};

export type ItineraryPreference = {
  categoryScores: {
    restaurant: number;
    cafe: number;
    shopping: number;
    attraction: number;
    local: number;
    experience: number;
    nature: number;
    rest: number;
  };
  densityScore: number;
};

export type ChallengeStyleChapter = {
  challengeStyleAnswers: Record<string, number>;
  itineraryMessageAnswers: Partial<
    Record<
      | 'restaurant'
      | 'cafe'
      | 'shopping'
      | 'attraction'
      | 'local'
      | 'experience'
      | 'nature'
      | 'rest'
      | 'density',
      ItinerarySentiment
    >
  >;
  type: ChallengeStyleType;
  scores: ChallengeStyleScores;
  scheduleStyle: ScheduleStyle;
  itineraryPreference: ItineraryPreference;
};

export type AccommodationChapter = {
  answers: {
    stayMeaning: number;
    locationFacility: number;
    comfortPrice: number;
  };
  scores: {
    stayImportance: number;
    facilityOverLocation: number;
    comfortOverPrice: number;
  };
};

export type StaminaChapter = {
  answer: StaminaAnswer;
  level: StaminaLevel;
  score: number;
};

export type BudgetChapter = {
  /** 코인 분배 없음. 5개 항목 순위만 */
  ranking: BudgetRankItem[];
};

export type DiscoveryChapter = {
  answers: {
    landmarkImportance: number;
    localInterest: number;
  };
  scores: {
    landmarkImportance: number;
    localInterest: number;
  };
};

/** FE가 complete/patch로 보내는 성향 테스트 응답 */
export type QuizResponses = {
  surveyVersion?: number;
  algorithmVersion?: number;
  challengeStyle?: ChallengeStyleChapter;
  accommodation?: AccommodationChapter;
  stamina?: StaminaChapter;
  budget?: BudgetChapter;
  discovery?: DiscoveryChapter;
};

/** 여행방 공유·매칭용 4축 캐시 (0–100) */
export type PersonalityAxes = {
  scheduleDensity: number;
  landmarkNecessity: number;
  localInterest: number;
  challenging: number;
};

/** User/test_results preferences 캐시 */
export type QuizPreferences = {
  surveyVersion?: number;
  algorithmVersion?: number;
  challengeStyleType?: ChallengeStyleType;
  scheduleStyleType?: ScheduleStyleType;
  challengeScores?: ChallengeStyleScores;
  scheduleStyle?: ScheduleStyle;
  itineraryPreference?: ItineraryPreference;
  accommodation?: AccommodationChapter['scores'];
  stamina?: StaminaChapter;
  budgetRanking?: BudgetRankItem[];
  discovery?: DiscoveryChapter['scores'];
};

export type MobilityConstraint = 'STAIRS' | 'STEEP_SLOPE' | 'LONG_WALK';

/** @deprecated 구 예산 코인 카테고리 (tags API mock 유지용) */
export type SpendingCategory =
  | 'ACCOMMODATION'
  | 'FOOD'
  | 'TRANSPORT'
  | 'TOURISM'
  | 'ACTIVITY'
  | 'SHOPPING'
  | 'CAFE_REST';
