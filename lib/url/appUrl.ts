function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

export function getIntraAppBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.APP_URL,
    process.env.SITE_URL
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return normalizeBaseUrl(candidate.trim());
    }
  }

  return 'https://intra.tre60grader.se';
}

export function getIntraAuthCallbackUrl() {
  return `${getIntraAppBaseUrl()}/auth/callback`;
}
