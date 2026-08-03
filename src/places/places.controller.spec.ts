import { RATE_LIMIT_KEY } from '../common/decorators/rate-limit.decorator';
import { PlacesController } from './places.controller';

describe('PlacesController rate limiting', () => {
  it('limits public Kakao/DB search requests', () => {
    const searchHandler = Object.getOwnPropertyDescriptor(
      PlacesController.prototype,
      'search',
    )?.value as object;
    const policy = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      searchHandler,
    ) as unknown;

    expect(policy).toEqual({ limit: 30, windowSeconds: 60 });
  });
});
