'use client';

import { useAppContext } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useVerificationDrafts, useSendVerification } from '@/features/finance/financeQueries';
import { useOnlineStatus } from '@/lib/ui/useOnlineStatus';

export default function VerificationDraftsPage() {
  const { role } = useAppContext();
  const query = useVerificationDrafts();
  const sendMutation = useSendVerification();
  const isOnline = useOnlineStatus();

  if (role === 'member' || role === 'auditor') {
    return <p className="rounded-lg bg-muted p-4 text-sm">Du saknar behörighet.</p>;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Verifikationsutkast</h2>
      {(query.data ?? []).map((draft) => (
        <Card key={draft.id} className="p-4">
          <p className="font-medium">{draft.description}</p>
          <p className="text-sm">{draft.date}</p>
          <p className="text-sm">Total: {draft.total}</p>
          <Button
            className="mt-3"
            disabled={!isOnline || sendMutation.isPending}
            onClick={() => sendMutation.mutate(draft)}
          >Lägg till</Button>
        </Card>
      ))}
      {(query.data ?? []).length === 0 && <p className="rounded-xl bg-muted p-4 text-sm">Inga utkast.</p>}
    </section>
  );
}