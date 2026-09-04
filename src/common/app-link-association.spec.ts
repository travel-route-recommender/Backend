import {
  buildAndroidAssetLinks,
  buildAppleAppSiteAssociation,
} from './app-link-association';

const ANDROID_FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).padStart(2, '0'),
).join(':');

describe('app link association documents', () => {
  it('builds Android Digital Asset Links from the signed package identity', () => {
    const result = buildAndroidAssetLinks({
      packageName: 'com.tripmatch.app',
      fingerprints: `${ANDROID_FINGERPRINT},${ANDROID_FINGERPRINT}`,
    });
    expect(result).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.tripmatch.app',
          sha256_cert_fingerprints: [ANDROID_FINGERPRINT.toUpperCase()],
        },
      },
    ]);
  });

  it('does not publish an Android association with missing or malformed signing data', () => {
    expect(
      buildAndroidAssetLinks({ packageName: 'com.tripmatch.app' }),
    ).toBeUndefined();
    expect(
      buildAndroidAssetLinks({
        packageName: 'invalid',
        fingerprints: ANDROID_FINGERPRINT,
      }),
    ).toBeUndefined();
    expect(
      buildAndroidAssetLinks({
        packageName: 'com.tripmatch.app',
        fingerprints: 'not-a-fingerprint',
      }),
    ).toBeUndefined();
  });

  it('builds an iOS association scoped to invite links', () => {
    expect(
      buildAppleAppSiteAssociation({ appIds: 'ABCDE12345.com.tripmatch.app' }),
    ).toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: 'ABCDE12345.com.tripmatch.app',
            paths: ['/api/v1/invites/*'],
          },
        ],
      },
    });
  });

  it('does not publish an iOS association with invalid app IDs', () => {
    expect(buildAppleAppSiteAssociation({ appIds: '' })).toBeUndefined();
    expect(
      buildAppleAppSiteAssociation({ appIds: 'TEAM.com.tripmatch.app' }),
    ).toBeUndefined();
  });
});
