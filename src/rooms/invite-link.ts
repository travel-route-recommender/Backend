const INVITE_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, '');
}

function absoluteUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    return new URL(value.trim());
  } catch {
    return undefined;
  }
}

/**
 * 메시지 앱이 custom scheme을 링크로 만들지 않는 문제를 피하기 위해 공개 HTTPS
 * 서버가 있으면 항상 표준 URL을 발급한다. 로컬 개발만 기존 scheme을 유지한다.
 */
export function buildCanonicalInviteLink(input: {
  code: string;
  configuredBase?: string;
  appBaseUrl?: string;
}) {
  const code = input.code.trim().toUpperCase();
  const configured = absoluteUrl(input.configuredBase);
  const appBase = absoluteUrl(input.appBaseUrl);
  const base =
    configured?.protocol === 'https:'
      ? trimTrailingSlashes(configured.toString())
      : appBase?.protocol === 'https:'
        ? `${appBase.origin}/api/v1/invites`
        : input.configuredBase?.trim()
          ? trimTrailingSlashes(input.configuredBase.trim())
          : 'tripmatch://invite';
  return `${base}/${encodeURIComponent(code)}`;
}

export function buildInviteLandingHtml(inviteCode: string) {
  const code = inviteCode.trim().toUpperCase();
  if (!INVITE_CODE_PATTERN.test(code)) {
    throw new Error('Invalid invite code');
  }
  const deepLink = `tripmatch://invite/${encodeURIComponent(code)}`;
  const scriptUrl = JSON.stringify(deepLink);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <title>두리 여행방 초대</title>
  <style>
    :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f7ff;color:#17213d}
    body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;box-sizing:border-box}
    main{width:min(100%,420px);box-sizing:border-box;background:#fff;border:1px solid #dfe6f6;border-radius:24px;padding:28px;box-shadow:0 16px 44px rgba(31,54,112,.12);text-align:center}
    h1{margin:0 0 10px;font-size:24px}p{margin:8px 0;color:#5b6684;line-height:1.55}
    a{display:block;margin-top:22px;padding:15px 18px;border-radius:14px;background:#476ff1;color:#fff;text-decoration:none;font-weight:700}
    code{display:inline-block;margin-top:14px;padding:8px 12px;border-radius:10px;background:#eef2ff;color:#33457f;font-size:16px;letter-spacing:1px}
  </style>
</head>
<body>
  <main>
    <h1>두리 여행방 초대</h1>
    <p>두리 앱에서 초대를 확인하고 여행방에 참여해 주세요.</p>
    <a href="${deepLink}">두리 앱에서 열기</a>
    <code>${code}</code>
    <p>앱이 자동으로 열리지 않으면 위 버튼을 눌러 주세요.</p>
  </main>
  <script>window.setTimeout(function(){window.location.href=${scriptUrl};},120);</script>
</body>
</html>`;
}
