'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { getInternalRoleLabel, useMfaStatus } from '@/features/security/mfa';

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint].filter((value) => typeof value === 'string' && value.length > 0) as string[];
    if (parts.length > 0) return parts.join(' | ');
  }
  return fallback;
}

export default function MfaSettingsCard() {
  const { authRole } = useAppContext();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const mfaStatusQuery = useMfaStatus(true);
  const [enrollCode, setEnrollCode] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [pendingTotp, setPendingTotp] = useState<{ factorId: string; qrCode: string | null; secret: string | null } | null>(null);

  const enrollTotpMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Tre60 ${getInternalRoleLabel(authRole)}`
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
      toast.success('Skanna QR-koden och bekräfta med din autentiseringsapp');
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
      if (!code) throw new Error('Ange den 6-siffriga koden');

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: pendingTotp.factorId,
        code
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      setPendingTotp(null);
      setEnrollCode('');
      await queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      toast.success('Tvåstegsverifiering är nu aktiv');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte verifiera koden'));
    }
  });

  const verifySessionMfaMutation = useMutation({
    mutationFn: async () => {
      const code = sessionCode.trim();
      const factor = (mfaStatusQuery.data?.verifiedFactors ?? [])[0];
      if (!factor?.id) throw new Error('Ingen verifierad faktor hittades');
      if (!code) throw new Error('Ange den 6-siffriga koden');

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code
      });

      if (error) throw error;
    },
    onSuccess: async () => {
      setSessionCode('');
      await queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      toast.success('Sessionen är nu verifierad med MFA');
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
      await queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      setPendingTotp(null);
      toast.success('MFA-faktor borttagen');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte ta bort MFA-faktor'));
    }
  });

  const verifiedCount = (mfaStatusQuery.data?.verifiedFactors ?? []).length;
  const isActive = verifiedCount > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Säkerhet och tvåstegsverifiering</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Intern roll: {getInternalRoleLabel(authRole)}</Badge>
          <Badge>{isActive ? 'MFA aktiv' : 'MFA ej aktiv'}</Badge>
          <Badge>Nuvarande AAL: {mfaStatusQuery.data?.currentLevel ?? 'okänd'}</Badge>
        </div>

        <p className="text-sm text-foreground/70">
          Tvåstegsverifiering rekommenderas för interna konton för att skydda projekt- och bolagsdata bättre.
        </p>

        {isActive ? (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="font-medium">Tvåstegsverifiering är aktiv</p>
            <p className="text-sm text-foreground/70">
              Du kan verifiera den här sessionen till högre säkerhetsnivå och hantera dina faktorer här.
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={sessionCode}
                onChange={(event) => setSessionCode(event.target.value)}
                placeholder="6-siffrig kod"
              />
              <Button onClick={() => verifySessionMfaMutation.mutate()} disabled={verifySessionMfaMutation.isPending}>
                {verifySessionMfaMutation.isPending ? 'Verifierar...' : 'Verifiera denna session'}
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
            <p className="font-medium">Aktivera TOTP</p>
            <p className="mt-1 text-sm text-foreground/70">
              Skanna QR-koden i en autentiseringsapp som Google Authenticator, Microsoft Authenticator, 1Password eller liknande.
            </p>
            <Button className="mt-3" onClick={() => enrollTotpMutation.mutate()} disabled={enrollTotpMutation.isPending}>
              {enrollTotpMutation.isPending ? 'Startar...' : 'Aktivera tvåstegsverifiering'}
            </Button>
          </div>
        )}

        {pendingTotp ? (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="font-medium">Slutför aktiveringen</p>
            {pendingTotp.qrCode ? (
              <img src={pendingTotp.qrCode} alt="QR-kod för TOTP" className="h-40 w-40 rounded border bg-white p-2" />
            ) : null}
            {pendingTotp.secret ? (
              <p className="text-sm text-foreground/70">
                Manuell nyckel: <span className="font-mono">{pendingTotp.secret}</span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Input
                value={enrollCode}
                onChange={(event) => setEnrollCode(event.target.value)}
                placeholder="6-siffrig kod"
              />
              <Button onClick={() => verifyEnrollMutation.mutate()} disabled={verifyEnrollMutation.isPending}>
                {verifyEnrollMutation.isPending ? 'Verifierar...' : 'Bekräfta'}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
