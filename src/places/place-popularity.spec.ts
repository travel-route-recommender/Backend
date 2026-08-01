import {
  buildPlacePopularityIncrement,
  calculatePlacePopularityScore,
  PLACE_POPULARITY_WEIGHTS,
} from './place-popularity';

describe('place popularity', () => {
  it('calculates a weighted popularity score from behavior counts', () => {
    expect(
      calculatePlacePopularityScore({
        searchCount: 10,
        detailViewCount: 4,
        saveCount: 2,
        candidateAddCount: 1,
      }),
    ).toBe(
      10 * PLACE_POPULARITY_WEIGHTS.searchCount +
        4 * PLACE_POPULARITY_WEIGHTS.detailViewCount +
        2 * PLACE_POPULARITY_WEIGHTS.saveCount +
        PLACE_POPULARITY_WEIGHTS.candidateAddCount,
    );
  });

  it('builds an atomic counter and score increment update', () => {
    const now = new Date('2026-08-02T00:00:00.000Z');

    expect(buildPlacePopularityIncrement('saveCount', 2, now)).toEqual({
      $inc: {
        'stats.saveCount': 2,
        popularityScore: PLACE_POPULARITY_WEIGHTS.saveCount * 2,
      },
      $set: {
        popularityUpdatedAt: now,
      },
    });
  });
});
