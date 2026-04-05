'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const updatePasswordMutation = useMutation({
    mutationFn: async () => {
      const trimmedPassword = nextPassword.trim();
      if (trimmedPassword.length < 10) {
        throw new Error('Det nya lösenordet måste vara minst 10 tecken.');
      }
      if (trimmedPassword !== confirmPassword.trim()) {
        throw new Error('Lösenorden matchar inte.');
      }

      const { error } = await supabase.auth.updateUser({ password: trimmedPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      setNextPassword('');
      setConfirmPassword('');
      setLastUpdatedAt(new Date().toISOString());
      toast.success('Lösenord uppdaterat');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte uppdatera lösenordet'));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Byt lösenord</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground/70">
          Ändra lösenordet för ditt interna konto. Använd ett unikt lösenord som inte används i någon annan tjänst.
        </p>
        {lastUpdatedAt ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
            Lösenordet uppdaterades {new Date(lastUpdatedAt).toLocaleString('sv-SE')}. Om du är inloggad på flera enheter kan vissa sessioner behöva logga in igen.
          </div>
        ) : null}
        <label className="space-y-1">
          <span className="text-sm">Nytt lösenord</span>
          <Input
            type="password"
            autoComplete="new-password"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
            placeholder="Minst 10 tecken"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm">Bekräfta nytt lösenord</span>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Skriv lösenordet igen"
          />
        </label>
        <div className="flex justify-end">
          <Button
            onClick={() => updatePasswordMutation.mutate()}
            disabled={updatePasswordMutation.isPending || nextPassword.length === 0 || confirmPassword.length === 0}
          >
            {updatePasswordMutation.isPending ? 'Uppdaterar...' : 'Byt lösenord'}
          </Button>
        </div>
        <p className="text-xs text-foreground/55">
          Efter lösenordsbyte fortsätter den här sessionen normalt, men andra öppna sessioner kan påverkas beroende på klient och inloggningsläge.
        </p>
      </CardContent>
    </Card>
  );
}
