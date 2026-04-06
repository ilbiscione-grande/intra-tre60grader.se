'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    const parts = [obj.message, obj.details, obj.hint].filter((value) => typeof value === 'string' && value.length > 0) as string[];
    if (parts.length > 0) return parts.join(' | ');
  }
  return fallback;
}

export default function PasswordSettingsCard() {
  const supabase = useMemo(() => createClient(), []);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!cancelled) {
        setUserEmail(user?.email ?? null);
      }
    }

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const sendResetMutation = useMutation({
    mutationFn: async () => {
      if (!userEmail) {
        throw new Error('Kunde inte läsa din e-postadress.');
      }

      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setLastSentAt(new Date().toISOString());
      toast.success('Länk för lösenordsbyte skickad');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte skicka länken för lösenordsbyte'));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lösenordsbyte via e-post</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground/70">
          Skicka en säker länk till din e-postadress för att välja ett nytt lösenord. Det här ersätter det gamla formuläret direkt i appen.
        </p>
        {lastSentAt ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
            Länk skickad {new Date(lastSentAt).toLocaleString('sv-SE')} till {userEmail ?? 'din e-postadress'}.
          </div>
        ) : null}
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <span className="font-medium">E-post för utskick:</span>{' '}
          <span className="text-foreground/70">{userEmail ?? 'Läser in...'}</span>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => sendResetMutation.mutate()}
            disabled={sendResetMutation.isPending || !userEmail}
          >
            {sendResetMutation.isPending ? 'Skickar...' : 'Skicka länk för lösenordsbyte'}
          </Button>
        </div>
        <p className="text-xs text-foreground/55">
          Om kontot finns och e-postadressen är giltig skickas en återställningslänk. Öppna länken i mejlet för att ange ett nytt lösenord.
        </p>
      </CardContent>
    </Card>
  );
}
