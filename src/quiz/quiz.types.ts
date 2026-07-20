/** 이동 수단 선호 (0–100) */
export type TransportPreferences = {
  CAR?: number;
  PUBLIC_TRANSIT?: number;
  WALKING?: number;
  TAXI?: number;
};

/** 숙소 스타일 축 (0–100) */
export type AccommodationPreference = {
  /** 0: 잠만 자는 곳 ↔ 100: 여행의 일부 */
  stayImportance: number;
  /** 0: 위치 우선 ↔ 100: 시설 우선 */
  facilityOverLocation: number;
  /** 0: 가격 우선 ↔ 100: 편안함 우선 */
  comfortOverPrice: number;
};

export type PlaceValidationPreference = 'LESS_VALIDATED' | 'VALIDATED';

export type StaminaLevel = 'LOW' | 'NORMAL' | 'HIGH';

export type SpendingCategory =
  | 'ACCOMMODATION'
  | 'FOOD'
  | 'TRANSPORT'
  | 'TOURISM'
  | 'ACTIVITY'
  | 'SHOPPING'
  | 'CAFE_REST';

export type SpendingAllocation = {
  totalCoins: number;
  allocation: Partial<Record<SpendingCategory, number>>;
};

export type ScheduleFeatures = {
  scheduleSpanMinutes: number;
  scheduledMinutes: number;
  activityMinutes: number;
  restMinutes: number;
  freeTimeMinutes: number;
  placeCount: number;
  restBlockCount: number;
  averageStayMinutes: number;
};

export type PlaceFeatures = {
  selectedPlaceCount: number;
  selectedLandmarkCount: number;
  selectedLocalPlaceCount: number;
  averageLandmarkScore: number;
  averageLocalScore: number;
  landmarkAllocatedMinutes: number;
  localAllocatedMinutes: number;
};

/** 프론트가 채운 반나절 일정 슬롯 */
export type ScheduleSlotDraft = {
  startMinutes: number;
  endMinutes: number;
  kind: 'PLACE' | 'REST' | 'FREE';
  placeId?: string;
  placeName?: string;
  /** 0–100: 명소에 가까운 정도 */
  landmarkScore?: number;
  /** 0–100: 로컬에 가까운 정도 */
  localScore?: number;
};

export type QuizResponses = {
  scheduleDraft?: ScheduleSlotDraft[];
  scheduleFeatures?: ScheduleFeatures;
  placeFeatures?: PlaceFeatures;
  transportPreferences?: TransportPreferences;
  accommodationPreference?: AccommodationPreference;
  placeValidationPreference?: PlaceValidationPreference;
  challenging?: number;
  staminaLevel?: StaminaLevel;
  spendingAllocation?: SpendingAllocation;
};

/** 최종 유형을 만드는 4축 (0–100) */
export type PersonalityAxes = {
  scheduleDensity: number;
  landmarkNecessity: number;
  localInterest: number;
  challenging: number;
};

export type QuizPreferences = {
  transportPreferences?: TransportPreferences;
  accommodationPreference?: AccommodationPreference;
  placeValidationPreference?: PlaceValidationPreference;
  challenging?: number;
  staminaLevel?: StaminaLevel;
  spendingAllocation?: SpendingAllocation;
  scheduleFeatures?: ScheduleFeatures;
  placeFeatures?: PlaceFeatures;
};

export type MobilityConstraint = 'STAIRS' | 'STEEP_SLOPE' | 'LONG_WALK';
