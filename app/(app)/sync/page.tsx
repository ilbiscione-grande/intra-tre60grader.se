'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  getQueueCounts,
  listActions,
  listDrafts,
  processQueue,
  resolveConflictKeepServer,
  resolveConflictUseLocal,
  retryFailed
} from '@/features/offline/syncQueue';
import { useOfflineStore } from '@/features/offline/offlineStore';
import type { QueueAction, VerificationDraft } from '@/lib/types';

type SyncData = {
  queued: number;
  conflicts: number;
  failed: number;
  done: number;
  drafts: number;
};

export default function SyncPage() {
  const [data, setData] = useState<SyncData>({ queued: 0, conflicts: 0, failed: 0, done: 0, drafts: 0 });
  const [actions, setActions] = useState<QueueAction[]>([]);
  const [drafts, setDrafts] = useState<VerificationDraft[]>([]);
  const [activeConflict, setActiveConflict] = useState<QueueAction | null>(null);
  const { companyId } = useAppContext();
  const setCounts = useOfflineStore((s) => s.setCounts);
  const isProduction = process.env.NODE_ENV === 'production';

  async function load() {
    const [allActions, allDrafts, counts] = await Promise.all([listActions(), listDrafts(), getQueueCounts()]);
    const filteredActions = allActions.filter((a) => a.company_id === companyId);
    const filteredDrafts = allDrafts.filter((d) => d.company_id === companyId);

    setCounts(counts);
    setActions(filteredActions);
    setDrafts(filteredDrafts);
    setData({
      queued: filteredActions.filter((a) => a.status === 'queued' || a.status === 'syncing').length,
      conflicts: filteredActions.filter((a) => a.status === 'conflict').length,
      failed: filteredActions.filter((a) => a.status === 'failed').length,
      done: filteredActions.filter((a) => a.status === 'done').length,
      drafts: filteredDrafts.length
    });
  }

  useEffect(() => {
    load().catch(() => null);
  }, [companyId]);

  const queued = actions.filter((a) => a.status === 'queued' || a.status === 'syncing');
  const conflicts = actions.filter((a) => a.status === 'conflict');
  const failed = actions.filter((a) => a.status === 'failed');

  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">Synkcenter</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Köade" value={data.queued} />
        <Stat label="Konflikter" value={data.conflicts} />
        <Stat label="Misslyckade" value={data.failed} />
        <Stat label="Klara" value={data.done} />
        <Stat label="Utkast" value={data.drafts} />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={async () => {
            await processQueue(companyId);
            await load();
          }}
        >
          Synka köade
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await retryFailed(companyId);
            await load();
          }}
        >
          Försök igen för misslyckade
        </Button>
      </div>

      <ListSection title="Köade åtgärder" actions={queued} />
      <ListSection title="Konflikter" actions={conflicts} onOpenConflict={setActiveConflict} />
      <ListSection title="Misslyckade" actions={failed} />

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">Verifikationsutkast</h3>
        {drafts.length === 0 && <p className="rounded-lg bg-muted p-3 text-sm">Inga utkast.</p>}
        {drafts.map((draft) => (
          <Card key={draft.id} className="p-3 text-sm">
            <p className="font-medium">{draft.description}</p>
            <p>{draft.date}</p>
            <p>Total: {draft.total}</p>
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <Link href="/finance/verifications/drafts">Öppna utkast</Link>
            </Button>
          </Card>
        ))}
      </div>

      <Dialog open={Boolean(activeConflict)} onOpenChange={(open) => !open && setActiveConflict(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konflikt</DialogTitle>
            <DialogDescription>
              Server-versionen är nyare än lokal basversion. Välj hur denna lokala action ska hanteras.
            </DialogDescription>
          </DialogHeader>

          {activeConflict && (
            <div className="space-y-2 text-sm">
              <p><strong>Typ:</strong> {activeConflict.type}</p>
              <p><strong>Projekt:</strong> {activeConflict.project_id ?? '-'}</p>
              {!isProduction ? (
                <pre className="rounded-lg bg-muted p-2 text-xs">{JSON.stringify(activeConflict.payload, null, 2)}</pre>
              ) : (
                <p className="rounded-lg bg-muted p-2 text-xs text-foreground/70">Detaljerad konfliktpayload är dold i produktion.</p>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await resolveConflictKeepServer(activeConflict.id);
                    toast.success('Konflikt markerad som löst: serverversion behålls');
                    setActiveConflict(null);
                    await load();
                  }}
                >
                  Behåll serverversion
                </Button>
                <Button
                  onClick={async () => {
                    await resolveConflictUseLocal(activeConflict.id);

                    if (navigator.onLine) {
                      await processQueue(companyId);
                      toast.info('Lokal ändring skickad igen');
                    } else {
                      toast.info('Lokal ändring köad, skickas när du är online');
                    }

                    setActiveConflict(null);
                    await load();
                  }}
                >
                  Använd lokal version
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function formatActionLabel(action: QueueAction) {
  if (action.type === 'CREATE_PROJECT') return 'Skapa projekt';
  if (action.type === 'SET_PROJECT_STATUS') return 'Ändra projektstatus';
  if (action.type === 'MOVE_PROJECT') return 'Flytta projekt';

  if (action.type === 'BOOK_INVOICE_ISSUE') {
    const invoiceNo = typeof action.payload.invoice_no === 'string' ? action.payload.invoice_no : null;
    return invoiceNo ? `Bokför faktura ${invoiceNo}` : 'Bokför faktura';
  }

  if (action.type === 'REGISTER_INVOICE_PAYMENT') {
    const invoiceNo = typeof action.payload.invoice_no === 'string' ? action.payload.invoice_no : null;
    return invoiceNo ? `Registrera betalning ${invoiceNo}` : 'Registrera betalning';
  }

  return action.type;
}

function ListSection({
  title,
  actions,
  onOpenConflict
}: {
  title: string;
  actions: QueueAction[];
  onOpenConflict?: (action: QueueAction) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/70">{title}</h3>
      {actions.length === 0 && <p className="rounded-lg bg-muted p-3 text-sm">Inga poster.</p>}
      {actions.map((action) => (
        <Card key={action.id} className="p-3 text-sm">
          <p className="font-medium">{formatActionLabel(action)}</p>
          <p>Status: {action.status}</p>
          {action.error && <p className="text-danger">{action.error}</p>}
          {action.status === 'conflict' && onOpenConflict && (
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => onOpenConflict(action)}>
              Öppna konflikt
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <p className="text-xs uppercase tracking-wide text-foreground/70">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-2xl font-semibold">{value}</p>
        {value > 0 && <Badge>{label}</Badge>}
      </div>
    </Card>
  );
}


