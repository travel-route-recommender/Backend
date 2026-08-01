export const PLACE_POPULARITY_WEIGHTS = {
  searchCount: 1,
  detailViewCount: 3,
  saveCount: 6,
  candidateAddCount: 8,
} as const;

export type PlacePopularityMetric = keyof typeof PLACE_POPULARITY_WEIGHTS;

export type PlacePopularityStats = Record<PlacePopularityMetric, number>;

export const DEFAULT_PLACE_POPULARITY_STATS: PlacePopularityStats = {
  searchCount: 0,
  detailViewCount: 0,
  saveCount: 0,
  candidateAddCount: 0,
};

export function calculatePlacePopularityScore(
  stats: Partial<PlacePopularityStats> = {},
): number {
  return Object.entries(PLACE_POPULARITY_WEIGHTS).reduce(
    (score, [metric, weight]) =>
      score + (stats[metric as PlacePopularityMetric] ?? 0) * weight,
    0,
  );
}

export function buildPlacePopularityIncrement(
  metric: PlacePopularityMetric,
  count = 1,
  now = new Date(),
) {
  const amount = Math.max(1, Math.floor(count));

  return {
    $inc: {
      [`stats.${metric}`]: amount,
      popularityScore: PLACE_POPULARITY_WEIGHTS[metric] * amount,
    },
    $set: {
      popularityUpdatedAt: now,
    },
  };
}
