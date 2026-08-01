import { buildCorsOptions, parseCorsOrigins } from './cors';

describe('CORS configuration', () => {
  it('parses comma-separated web auth origins', () => {
    expect(
      parseCorsOrigins(' https://app.example.com, http://localhost:5173 ,, '),
    ).toEqual(['https://app.example.com', 'http://localhost:5173']);
  });

  it('allows only configured browser origins while keeping non-browser requests usable', () => {
    const options = buildCorsOptions(['https://app.example.com']);
    const origin = options.origin as (
      requestOrigin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => void;

    const allowed = jest.fn();
    origin('https://app.example.com', allowed);
    expect(allowed).toHaveBeenCalledWith(null, true);

    const noOrigin = jest.fn();
    origin(undefined, noOrigin);
    expect(noOrigin).toHaveBeenCalledWith(null, true);

    const rejected = jest.fn();
    origin('https://evil.example.com', rejected);
    expect(rejected).toHaveBeenCalledWith(expect.any(Error), false);
  });
});
