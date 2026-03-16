'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import {
  useAppPreferences,
  type InterfaceModePreference,
  type ThemePreference
} from '@/components/providers/AppPreferencesProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { periodCloseChecklist } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import BackupRetentionCard from '@/components/settings/BackupRetentionCard';

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint].filter((v) => typeof v === 'string' && v.length > 0) as string[];
    if (parts.length > 0) return parts.join(' | ');
  }
  return fallback;
}

type CompanyRow = {
  id: string;
  name: string;
  created_at: string;
  org_no: string | null;
  vat_no: string | null;
  billing_email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  bankgiro: string | null;
  plusgiro: string | null;
  iban: string | null;
  bic: string | null;
  invoice_prefix: string | null;
  locked_until: string | null;
  default_payment_terms_days: number | null;
  late_payment_interest_rate: number | null;
  invoice_terms_note: string | null;
};

type SecurityEventRow = {
  id: string;
  scope: string;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  ip: string | null;
  user_agent: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type MfaFactor = {
  id: string;
  friendly_name?: string | null;
  factor_type?: string;
  status?: string;
};

type MfaStatus = {
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  verifiedFactors: MfaFactor[];
  unverifiedFactors: MfaFactor[];
};

const SIDEBAR_KEY = 'desktop_sidebar_collapsed';

export default function SettingsPage() {
  const { role, companyId } = useAppContext();
  const { theme, setTheme, interfaceMode, setInterfaceMode } = useAppPreferences();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const [sidebarDefault, setSidebarDefault] = useState<'expanded' | 'collapsed'>('expanded');
  const [companyDraft, setCompanyDraft] = useState<Partial<CompanyRow>>({});
  const [periodLockDate, setPeriodLockDate] = useState('');
  const [closePeriodStart, setClosePeriodStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [closePeriodEnd, setClosePeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [mfaCode, setMfaCode] = useState('');
  const [enrollCode, setEnrollCode] = useState('');
  const [pendingTotp, setPendingTotp] = useState<{ factorId: string; qrCode: string | null; secret: string | null } | null>(null);
  const isProduction = process.env.NODE_ENV === 'production';

  useEffect(() => {
    const value = window.localStorage.getItem(SIDEBAR_KEY);
    setSidebarDefault(value === '1' ? 'collapsed' : 'expanded');
  }, []);

  const companyQuery = useQuery<CompanyRow | null>({
    queryKey: ['settings-company', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select(
          'id,name,created_at,org_no,vat_no,billing_email,phone,address_line1,address_line2,postal_code,city,country,bankgiro,plusgiro,iban,bic,invoice_prefix,locked_until,default_payment_terms_days,late_payment_interest_rate,invoice_terms_note'
        )
        .eq('id', companyId)
        .maybeSingle<CompanyRow>();

      if (error) throw error;
      return data;
    }
  });

  const closeChecklistQuery = useQuery({
    queryKey: ['period-close-checklist', companyId, closePeriodStart, closePeriodEnd],
    queryFn: () => periodCloseChecklist(companyId, closePeriodStart, closePeriodEnd),
    enabled: role !== 'member'
  });

  const securityEventsQuery = useQuery<SecurityEventRow[]>({
    queryKey: ['security-events', companyId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/security/events?companyId=${encodeURIComponent(companyId)}&limit=25`);
      const payload = (await response.json().catch(() => null)) as { events?: SecurityEventRow[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Kunde inte läsa säkerhetshändelser');
      return payload?.events ?? [];
    },
    enabled: role === 'admin'
  });

  const mfaStatusQuery = useQuery<MfaStatus>({
    queryKey: ['mfa-status'],
    queryFn: async () => {
      const [aalResult, factorsResult] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors()
      ]);

      if (aalResult.error) throw aalResult.error;
      if (factorsResult.error) throw factorsResult.error;

      return {
        currentLevel: aalResult.data?.currentLevel ?? null,
        nextLevel: aalResult.data?.nextLevel ?? null,
        verifiedFactors: ((factorsResult.data?.all ?? []) as MfaFactor[]).filter((factor) => factor.status === 'verified'),
        unverifiedFactors: ((factorsResult.data?.all ?? []) as MfaFactor[]).filter((factor) => factor.status !== 'verified')
      };
    },
    enabled: role === 'admin'
  });

  useEffect(() => {
    if (!companyQuery.data) return;
    setCompanyDraft(companyQuery.data);
    setPeriodLockDate(companyQuery.data.locked_until ?? '');
  }, [companyQuery.data]);

  const saveCompanyMutation = useMutation({
    mutationFn: async () => {
      const cleanName = (companyDraft.name ?? '').trim();
      if (!cleanName) throw new Error('Företagsnamn krävs');

      const payload = {
        companyId,
        name: cleanName,
        org_no: nullIfEmpty(companyDraft.org_no),
        vat_no: nullIfEmpty(companyDraft.vat_no),
        billing_email: nullIfEmpty(companyDraft.billing_email),
        phone: nullIfEmpty(companyDraft.phone),
        address_line1: nullIfEmpty(companyDraft.address_line1),
        address_line2: nullIfEmpty(companyDraft.address_line2),
        postal_code: nullIfEmpty(companyDraft.postal_code),
        city: nullIfEmpty(companyDraft.city),
        country: nullIfEmpty(companyDraft.country),
        bankgiro: nullIfEmpty(companyDraft.bankgiro),
        plusgiro: nullIfEmpty(companyDraft.plusgiro),
        iban: nullIfEmpty(companyDraft.iban),
        bic: nullIfEmpty(companyDraft.bic),
        invoice_prefix: nullIfEmpty(companyDraft.invoice_prefix),
        default_payment_terms_days: toIntOrDefault(companyDraft.default_payment_terms_days, 30),
        late_payment_interest_rate: toDecimalOrNull(companyDraft.late_payment_interest_rate),
        invoice_terms_note: nullIfEmpty(companyDraft.invoice_terms_note)
      };

      const response = await fetch('/api/admin/company-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? 'Kunde inte spara företagsinställningar');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings-company', companyId] });
      toast.success('Företagsinställningar sparade');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte spara företagsinställningar'));
    }
  });

  const periodLockMutation = useMutation({
    mutationFn: async ({ lockedUntil }: { lockedUntil: string | null }) => {
      const response = await fetch('/api/admin/period-lock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          companyId,
          lockedUntil
        })
      });

      const payload = (await response.json().catch(() => null)) as { result?: unknown; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Kunde inte uppdatera periodlås');
      }

      return payload?.result ?? null;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings-company', companyId] });
      toast.success('Periodlås uppdaterat');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte uppdatera periodlås'));
    }
  });

  const enrollTotpMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Projectify Admin'
      });

      if (error) throw error;
      const result = data as { id?: string; totp?: { qr_code?: string; secret?: string } } | null;
      if (!result?.id) throw new Error('Kunde inte starta MFA-aktivering');
      return {
        factorId: result.id,
        qrCode: result.totp?.qr_code ?? null,
        secret: result.totp?.secret ?? null
      };
    },
    onSuccess: (result) => {
      setPendingTotp(result);
      setEnrollCode('');
      toast.success('Skanna QR-koden och verifiera med din autentiseringsapp');
      void mfaStatusQuery.refetch();
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte starta MFA-aktivering'));
    }
  });

  const verifyEnrollMutation = useMutation({
    mutationFn: async () => {
      if (!pendingTotp?.factorId) throw new Error('Ingen pågående MFA-aktivering');
      const code = enrollCode.trim();
      if (!code) throw new Error('Ange koden från autentiseringsappen');

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pendingTotp.factorId,
        code
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      setPendingTotp(null);
      setEnrollCode('');
      await mfaStatusQuery.refetch();
      toast.success('MFA aktiverad för adminkonto');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte verifiera MFA-koden'));
    }
  });

  const verifySessionMfaMutation = useMutation({
    mutationFn: async () => {
      const code = mfaCode.trim();
      const factor = (mfaStatusQuery.data?.verifiedFactors ?? [])[0];
      if (!factor?.id) throw new Error('Ingen verifierad MFA-faktor hittades');
      if (!code) throw new Error('Ange MFA-koden');

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      setMfaCode('');
      await mfaStatusQuery.refetch();
      toast.success('MFA verifierad för denna session');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte verifiera MFA för sessionen'));
    }
  });

  const unenrollMfaMutation = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
    },
    onSuccess: async () => {
      await mfaStatusQuery.refetch();
      toast.success('MFA-faktor borttagen');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte ta bort MFA-faktor'));
    }
  });

  const securityAlerts = useMemo(() => {
    const events = securityEventsQuery.data ?? [];
    const now = Date.now();
    const last24h = events.filter((event) => now - new Date(event.created_at).getTime() <= 24 * 60 * 60 * 1000);
    const warningCount = last24h.filter((event) => event.severity === 'warning' || event.severity === 'critical').length;
    const stepUpBlocked = last24h.filter((event) => event.event_type.includes('step_up_blocked')).length;
    const needsMfa = (mfaStatusQuery.data?.verifiedFactors ?? []).length === 0;

    const alerts: Array<{ severity: 'info' | 'warning' | 'critical'; title: string; detail: string }> = [];

    if (warningCount >= 3) {
      alerts.push({
        severity: 'critical',
        title: 'Förhöjd säkerhetsnivå',
        detail: `${warningCount} varningar eller kritiska händelser senaste 24 timmarna.`
      });
    } else if (warningCount > 0) {
      alerts.push({
        severity: 'warning',
        title: 'Säkerhetshändelser senaste dygnet',
        detail: `${warningCount} varningshändelser registrerade senaste 24 timmarna.`
      });
    }

    if (stepUpBlocked > 0) {
      alerts.push({
        severity: 'warning',
        title: 'Blockerade adminförsök',
        detail: `${stepUpBlocked} adminförsök stoppades av step-up-skyddet senaste 24 timmarna.`
      });
    }

    if (needsMfa) {
      alerts.push({
        severity: 'info',
        title: 'MFA saknas för admin',
        detail: 'Aktivera TOTP-MFA för att låsa upp AAL2-skydd för känsliga åtgärder.'
      });
    }

    return alerts;
  }, [mfaStatusQuery.data, securityEventsQuery.data]);

  function applySidebarDefault(next: 'expanded' | 'collapsed') {
    setSidebarDefault(next);
    window.localStorage.setItem(SIDEBAR_KEY, next === 'collapsed' ? '1' : '0');
    toast.success('Standardläge för sidebar uppdaterat');
  }

  function setField<K extends keyof CompanyRow>(key: K, value: CompanyRow[K]) {
    setCompanyDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Appinställningar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-sm">Tema</span>
              <Select value={theme} onValueChange={(value) => setTheme(value as ThemePreference)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Ljust</SelectItem>
                  <SelectItem value="dark">Mörkt</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1">
              <span className="text-sm">Visningsläge</span>
              <Select value={interfaceMode} onValueChange={(value) => setInterfaceMode(value as InterfaceModePreference)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (brytpunkt)</SelectItem>
                  <SelectItem value="mobile">Mobil</SelectItem>
                  <SelectItem value="desktop">Desktop</SelectItem>
                </SelectContent>
              </Select>
            </label>

            <label className="space-y-1">
              <span className="text-sm">Desktop-sidomeny</span>
              <Select value={sidebarDefault} onValueChange={(value) => applySidebarDefault(value as 'expanded' | 'collapsed')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expanded">Expanderad</SelectItem>
                  <SelectItem value="collapsed">Hopfälld</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge>Tema: {theme}</Badge>
            <Badge>Läge: {interfaceMode}</Badge>
            <Badge>Sidomeny: {sidebarDefault}</Badge>
          </div>

          <Button asChild variant="secondary">
            <Link href="/sync">Öppna synkcenter</Link>
          </Button>
        </CardContent>
      </Card>

      <RoleGate role={role} allow={['admin']}>
        <BackupRetentionCard companyId={companyId} isAdmin={role === 'admin'} canWrite={role === 'admin'} />

        <Card>
          <CardHeader>
            <CardTitle>Säkerhetshändelser</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Baslinje för C4: adminhändelser loggas, inloggningslänk skyddas av serverstyrd rate limiting och känsliga admin-API:er kräver färsk inloggning.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Rate limit: magic link</Badge>
              <Badge>Övervakning: senaste 25 bolagshändelser</Badge>
              <Badge>Step-up: senaste 30 min</Badge>
              <Button variant="secondary" onClick={() => securityEventsQuery.refetch()} disabled={securityEventsQuery.isFetching}>
                {securityEventsQuery.isFetching ? 'Uppdaterar...' : 'Uppdatera'}
              </Button>
            </div>

            {(securityEventsQuery.data ?? []).length === 0 ? (
              <p className="rounded bg-muted p-3 text-sm text-foreground/70">Inga säkerhetshändelser registrerade ännu.</p>
            ) : (
              <div className="space-y-2">
                {(securityEventsQuery.data ?? []).map((event) => (
                  <div key={event.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={event.severity === 'critical' ? 'bg-destructive text-destructive-foreground' : event.severity === 'warning' ? 'bg-amber-100 text-amber-900' : undefined}>
                        {event.severity}
                      </Badge>
                      <Badge>{event.scope}</Badge>
                      <span className="font-medium">{event.event_type}</span>
                      <span className="text-foreground/60">{new Date(event.created_at).toLocaleString('sv-SE')}</span>
                    </div>
                    <p className="mt-2 text-foreground/70">
                      IP: {event.ip ?? '-'} | Agent: {event.user_agent ?? '-'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Säkerhetslarm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(securityAlerts ?? []).length === 0 ? (
              <p className="rounded bg-muted p-3 text-sm text-foreground/70">Inga aktiva larm just nu.</p>
            ) : (
              <div className="space-y-2">
                {securityAlerts.map((alert, index) => (
                  <div key={`${alert.title}-${index}`} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={alert.severity === 'critical' ? 'bg-destructive text-destructive-foreground' : alert.severity === 'warning' ? 'bg-amber-100 text-amber-900' : undefined}>
                        {alert.severity}
                      </Badge>
                      <span className="font-medium">{alert.title}</span>
                    </div>
                    <p className="mt-2 text-foreground/70">{alert.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MFA för admin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Nuvarande AAL: {mfaStatusQuery.data?.currentLevel ?? 'okänd'}</Badge>
              <Badge>Nästa AAL: {mfaStatusQuery.data?.nextLevel ?? 'okänd'}</Badge>
              <Badge>Verifierade faktorer: {(mfaStatusQuery.data?.verifiedFactors ?? []).length}</Badge>
              <Button variant="secondary" onClick={() => mfaStatusQuery.refetch()} disabled={mfaStatusQuery.isFetching}>
                {mfaStatusQuery.isFetching ? 'Uppdaterar...' : 'Uppdatera MFA-status'}
              </Button>
            </div>

            {(mfaStatusQuery.data?.verifiedFactors ?? []).length > 0 ? (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="font-medium">Verifiera MFA för denna session</p>
                <p className="text-sm text-foreground/70">
                  Om känsliga adminåtgärder kräver MFA måste den här sessionen lyftas till `aal2`.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="6-siffrig kod" />
                  <Button onClick={() => verifySessionMfaMutation.mutate()} disabled={verifySessionMfaMutation.isPending}>
                    {verifySessionMfaMutation.isPending ? 'Verifierar...' : 'Verifiera session'}
                  </Button>
                </div>
                {(mfaStatusQuery.data?.verifiedFactors ?? []).map((factor) => (
                  <div key={factor.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge>{factor.factor_type ?? 'factor'}</Badge>
                    <span>{factor.friendly_name ?? factor.id}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => unenrollMfaMutation.mutate(factor.id)}
                      disabled={unenrollMfaMutation.isPending}
                    >
                      Ta bort
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border p-3">
                <p className="font-medium">Aktivera TOTP-MFA</p>
                <p className="mt-1 text-sm text-foreground/70">
                  Skanna QR-koden i en autentiseringsapp som 1Password, Bitwarden eller Google Authenticator.
                </p>
                <Button className="mt-3" onClick={() => enrollTotpMutation.mutate()} disabled={enrollTotpMutation.isPending}>
                  {enrollTotpMutation.isPending ? 'Startar...' : 'Aktivera MFA'}
                </Button>
              </div>
            )}

            {pendingTotp ? (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="font-medium">Slutför MFA-aktivering</p>
                {pendingTotp.qrCode ? <img src={pendingTotp.qrCode} alt="MFA QR-kod" className="h-40 w-40 rounded border bg-white p-2" /> : null}
                {pendingTotp.secret ? <p className="text-sm text-foreground/70">Hemlig nyckel: <span className="font-mono">{pendingTotp.secret}</span></p> : null}
                <div className="flex flex-wrap gap-2">
                  <Input value={enrollCode} onChange={(event) => setEnrollCode(event.target.value)} placeholder="6-siffrig kod" />
                  <Button onClick={() => verifyEnrollMutation.mutate()} disabled={verifyEnrollMutation.isPending}>
                    {verifyEnrollMutation.isPending ? 'Verifierar...' : 'Bekräfta MFA'}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stangningschecklista (manad)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-sm">Periodstart</span>
                <Input type="date" value={closePeriodStart} onChange={(event) => setClosePeriodStart(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-sm">Periodslut</span>
                <Input type="date" value={closePeriodEnd} onChange={(event) => setClosePeriodEnd(event.target.value)} />
              </label>
              <div className="flex items-end">
                <Button className="w-full" variant="secondary" onClick={() => closeChecklistQuery.refetch()}>
                  Uppdatera check
                </Button>
              </div>
            </div>

            {!isProduction ? (
              <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(closeChecklistQuery.data ?? {}, null, 2)}</pre>
            ) : (
              <p className="rounded bg-muted p-3 text-sm text-foreground/70">Checklista uppdaterad. Detaljerad debug-data visas endast i utvecklingsläge.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Periodstängning</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Lås bokföring t.o.m ett visst datum. Nya verifikationer, makuleringar och rättelser blockeras i låst period.
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm">Låst t.o.m</span>
                <Input type="date" value={periodLockDate} onChange={(event) => setPeriodLockDate(event.target.value)} />
              </label>
              <div className="flex items-end gap-2">
                <Button
                  className="w-full"
                  disabled={periodLockMutation.isPending || !periodLockDate}
                  onClick={() => periodLockMutation.mutate({ lockedUntil: periodLockDate })}
                >
                  Lås period
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={periodLockMutation.isPending}
                  onClick={() => periodLockMutation.mutate({ lockedUntil: null })}
                >
                  Lås upp
                </Button>
              </div>
            </div>
            <Badge>Nuvarande lås: {companyQuery.data?.locked_until ?? 'Inget'}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Företagsinställningar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 md:grid-cols-2">
              <InputWithLabel label="Företagsnamn" value={companyDraft.name ?? ''} onChange={(v) => setField('name', v)} />
              <InputWithLabel label="Organisationsnummer" value={companyDraft.org_no ?? ''} onChange={(v) => setField('org_no', v)} />
              <InputWithLabel label="Momsregistreringsnummer" value={companyDraft.vat_no ?? ''} onChange={(v) => setField('vat_no', v)} />
              <InputWithLabel label="Faktura e-post" value={companyDraft.billing_email ?? ''} onChange={(v) => setField('billing_email', v)} />
              <InputWithLabel label="Telefon" value={companyDraft.phone ?? ''} onChange={(v) => setField('phone', v)} />
              <InputWithLabel label="Adressrad 1" value={companyDraft.address_line1 ?? ''} onChange={(v) => setField('address_line1', v)} />
              <InputWithLabel label="Adressrad 2" value={companyDraft.address_line2 ?? ''} onChange={(v) => setField('address_line2', v)} />
              <InputWithLabel label="Postnummer" value={companyDraft.postal_code ?? ''} onChange={(v) => setField('postal_code', v)} />
              <InputWithLabel label="Stad" value={companyDraft.city ?? ''} onChange={(v) => setField('city', v)} />
              <InputWithLabel label="Land" value={companyDraft.country ?? ''} onChange={(v) => setField('country', v)} />
              <InputWithLabel label="Bankgiro" value={companyDraft.bankgiro ?? ''} onChange={(v) => setField('bankgiro', v)} />
              <InputWithLabel label="Plusgiro" value={companyDraft.plusgiro ?? ''} onChange={(v) => setField('plusgiro', v)} />
              <InputWithLabel label="IBAN" value={companyDraft.iban ?? ''} onChange={(v) => setField('iban', v)} />
              <InputWithLabel label="BIC/SWIFT" value={companyDraft.bic ?? ''} onChange={(v) => setField('bic', v)} />
              <InputWithLabel label="Fakturaprefix" value={companyDraft.invoice_prefix ?? ''} onChange={(v) => setField('invoice_prefix', v)} />
              <InputWithLabel
                label="Betalningsvillkor (dagar netto)"
                value={String(companyDraft.default_payment_terms_days ?? 30)}
                onChange={(v) => setField('default_payment_terms_days', Number(v || 0))}
              />
              <InputWithLabel
                label="Dröjsmålsränta %"
                value={companyDraft.late_payment_interest_rate == null ? '' : String(companyDraft.late_payment_interest_rate)}
                onChange={(v) => setField('late_payment_interest_rate', v === '' ? null : Number(v))}
              />
              <InputWithLabel
                label="Fakturavillkorstext"
                value={companyDraft.invoice_terms_note ?? ''}
                onChange={(v) => setField('invoice_terms_note', v)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => saveCompanyMutation.mutate()} disabled={saveCompanyMutation.isPending}>
                {saveCompanyMutation.isPending ? 'Sparar...' : 'Spara företag'}
              </Button>
              <Badge>företag_id: {companyId}</Badge>
              {companyQuery.data?.created_at && (
                <Badge>Skapat: {new Date(companyQuery.data.created_at).toLocaleDateString('sv-SE')}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </RoleGate>
    </section>
  );
}

function InputWithLabel({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="text-sm">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function nullIfEmpty(value: string | null | undefined) {
  const clean = (value ?? '').trim();
  return clean.length === 0 ? null : clean;
}

function toDecimalOrNull(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return null;
  return Number(value);
}

function toIntOrDefault(value: number | null | undefined, fallback: number) {
  if (value == null || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(365, Math.round(Number(value))));
}




