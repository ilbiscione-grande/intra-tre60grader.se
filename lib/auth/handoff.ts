type HandoffConsumeRequest = {
  handoff: string;
  app: 'intra';
};

type SessionPayload = {
  access_token: string;
  refresh_token: string;
};

function getLoginAppUrl() {
  return (process.env.NEXT_PUBLIC_LOGIN_APP_URL || 'https://login.tre60grader.se').replace(/\/+$/, '');
}

function getHandoffAuthHeader() {
  const secret = process.env.LOGIN_APP_HANDOFF_SECRET?.trim();

  if (!secret) {
    throw new Error('Missing LOGIN_APP_HANDOFF_SECRET');
  }

  return `Bearer ${secret}`;
}

function extractSessionPayload(payload: unknown): SessionPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directAccessToken = typeof record.access_token === 'string' ? record.access_token : null;
  const directRefreshToken = typeof record.refresh_token === 'string' ? record.refresh_token : null;

  if (directAccessToken && directRefreshToken) {
    return {
      access_token: directAccessToken,
      refresh_token: directRefreshToken
    };
  }

  const session = record.session;
  if (!session || typeof session !== 'object') {
    return null;
  }

  const sessionRecord = session as Record<string, unknown>;
  const sessionAccessToken = typeof sessionRecord.access_token === 'string' ? sessionRecord.access_token : null;
  const sessionRefreshToken = typeof sessionRecord.refresh_token === 'string' ? sessionRecord.refresh_token : null;

  if (!sessionAccessToken || !sessionRefreshToken) {
    return null;
  }

  return {
    access_token: sessionAccessToken,
    refresh_token: sessionRefreshToken
  };
}

export async function consumeLoginHandoff(handoff: string): Promise<SessionPayload> {
  const endpoint = new URL('/api/handoff/consume', `${getLoginAppUrl()}/`);
  const body: HandoffConsumeRequest = {
    handoff,
    app: 'intra'
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getHandoffAuthHeader()
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
        ? ((payload as Record<string, unknown>).error as string)
        : `Handoff consume failed with status ${response.status}`;

    throw new Error(message);
  }

  const sessionPayload = extractSessionPayload(payload);

  if (!sessionPayload) {
    throw new Error('Handoff consume response did not include a session payload');
  }

  return sessionPayload;
}
