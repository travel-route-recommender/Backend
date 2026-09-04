const ANDROID_PACKAGE_PATTERN =
  /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const SHA256_FINGERPRINT_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const APPLE_APP_ID_PATTERN = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/;

function uniqueCsv(value: string | undefined) {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function buildAndroidAssetLinks(input: {
  packageName?: string;
  fingerprints?: string;
}) {
  const packageName = input.packageName?.trim();
  const fingerprints = uniqueCsv(input.fingerprints).map((value) =>
    value.toUpperCase(),
  );
  if (!packageName || !ANDROID_PACKAGE_PATTERN.test(packageName))
    return undefined;
  if (
    !fingerprints.length ||
    fingerprints.some((value) => !SHA256_FINGERPRINT_PATTERN.test(value))
  ) {
    return undefined;
  }
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export function buildAppleAppSiteAssociation(input: {
  appIds?: string;
  invitePath?: string;
}) {
  const appIds = uniqueCsv(input.appIds);
  if (
    !appIds.length ||
    appIds.some((value) => !APPLE_APP_ID_PATTERN.test(value))
  )
    return undefined;
  const invitePath = input.invitePath?.trim() || '/api/v1/invites/*';
  if (!invitePath.startsWith('/') || !invitePath.endsWith('*'))
    return undefined;
  return {
    applinks: {
      apps: [],
      details: appIds.map((appID) => ({ appID, paths: [invitePath] })),
    },
  };
}
