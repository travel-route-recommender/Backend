import { classifyUsedRefreshAttempt } from './auth-session.service';

describe('refresh reuse classification', () => {
  it('accepts only the same logical operation with a cached response', () => {
    expect(
      classifyUsedRefreshAttempt({
        tokenStatus: 'used',
        originalOperationIdHash: 'operation-x',
        requestedOperationIdHash: 'operation-x',
        hasRetryResponse: true,
      }),
    ).toBe('duplicate');
  });

  it.each([
    ['operation-y', true],
    ['operation-x', false],
  ])(
    'classifies a different or expired operation as reuse',
    (operation, cached) => {
      expect(
        classifyUsedRefreshAttempt({
          tokenStatus: 'used',
          originalOperationIdHash: 'operation-x',
          requestedOperationIdHash: operation,
          hasRetryResponse: cached,
        }),
      ).toBe('reuse');
    },
  );
});
