import {
  buildCanonicalInviteLink,
  buildInviteLandingHtml,
} from './invite-link';

describe('invite links', () => {
  it('uses the public HTTPS API landing page instead of a custom scheme in production', () => {
    expect(
      buildCanonicalInviteLink({
        code: 'ABCD2345',
        configuredBase: 'tripmatch://invite',
        appBaseUrl: 'https://backend.example.com',
      }),
    ).toBe('https://backend.example.com/api/v1/invites/ABCD2345');
  });

  it('preserves a separately configured HTTPS invite domain', () => {
    expect(
      buildCanonicalInviteLink({
        code: 'ABCD2345',
        configuredBase: 'https://join.example.com/invite/',
        appBaseUrl: 'https://backend.example.com',
      }),
    ).toBe('https://join.example.com/invite/ABCD2345');
  });

  it('keeps the custom scheme when only a local server is available', () => {
    expect(
      buildCanonicalInviteLink({
        code: 'ABCD2345',
        configuredBase: 'tripmatch://invite',
        appBaseUrl: 'http://localhost:3000',
      }),
    ).toBe('tripmatch://invite/ABCD2345');
  });

  it('builds an app-opening page without interpolating arbitrary invite input', () => {
    const html = buildInviteLandingHtml('ABCD2345');
    expect(html).toContain('tripmatch://invite/ABCD2345');
    expect(html).toContain('두리 앱에서 열기');
    expect(() => buildInviteLandingHtml('<script>')).toThrow(
      'Invalid invite code',
    );
  });
});
