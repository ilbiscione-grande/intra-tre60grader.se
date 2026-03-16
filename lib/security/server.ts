import crypto from 'node:crypto';
import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type SecuritySeverity = 'info' | 'warning' | 'critical';

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function sendSecurityWebhook(payload: {
  companyId?: string | null;
  userId?: string | null;
  scope: string;
  eventType: string;
  severity: SecuritySeverity;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown> | null;
}) {
  const webhookUrl = process.env.SECURITY_ALERT_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source: 'projectify-bookie',
      timestamp: new Date().toISOString(),
      company_id: payload.companyId ?? null,
      actor_user_id: payload.userId ?? null,
      scope: payload.scope,
      event_type: payload.eventType,
      severity: payload.severity,
      ip: payload.ip ?? null,
      user_agent: payload.userAgent ?? null,
      details: payload.details ?? {}
    })
  });

  if (!response.ok) {
    throw new Error(`Security webhook failed with status ${response.status}`);
  }
}

export function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return 'unknown';
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashIdentifier(identifier: string) {
  return crypto.createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex');
}

export async function consumeSecurityRateLimit({
  scope,
  identifier,
  windowSeconds,
  maxAttempts
}: {
  scope: string;
  identifier: string;
  windowSeconds: number;
  maxAttempts: number;
}) {
  const admin = createAdminClient() as unknown as RpcClient;
  const { data, error } = await admin.rpc('consume_security_rate_limit', {
    p_scope: scope,
    p_identifier: identifier,
    p_window_seconds: windowSeconds,
    p_max_attempts: maxAttempts
  });

  if (error) {
    throw new Error(error.message || 'Rate limit RPC failed');
  }

  const result = (data ?? {}) as Record<string, unknown>;
  return {
    allowed: Boolean(result.allowed),
    remaining: Number(result.remaining ?? 0),
    resetAt: typeof result.reset_at === 'string' ? result.reset_at : null
  };
}

export async function logSecurityEvent({
  companyId,
  userId,
  scope,
  eventType,
  severity = 'info',
  identifier,
  ip,
  userAgent,
  payload
}: {
  companyId?: string | null;
  userId?: string | null;
  scope: string;
  eventType: string;
  severity?: SecuritySeverity;
  identifier?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown> | null;
}) {
  const admin = createAdminClient() as unknown as RpcClient;
  const { error } = await admin.rpc('log_security_event', {
    p_company_id: companyId ?? null,
    p_actor_user_id: userId ?? null,
    p_scope: scope,
    p_event_type: eventType,
    p_severity: severity,
    p_identifier_hash: identifier ? hashIdentifier(identifier) : null,
    p_ip: ip ?? null,
    p_user_agent: userAgent ?? null,
    p_payload: payload ?? {}
  });

  if (error) {
    throw new Error(error.message || 'Security event RPC failed');
  }
}

export async function safeLogSecurityEvent(params: Parameters<typeof logSecurityEvent>[0]) {
  try {
    await logSecurityEvent(params);
    if (params.severity === 'critical') {
      await sendSecurityWebhook({
        companyId: params.companyId,
        userId: params.userId,
        scope: params.scope,
        eventType: params.eventType,
        severity: params.severity,
        ip: params.ip,
        userAgent: params.userAgent,
        details: params.payload
      });
    }
  } catch (error) {
    console.error('Security event logging failed', error);
  }
}
