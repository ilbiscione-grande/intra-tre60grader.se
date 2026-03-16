'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type BackupPolicy = {
  company_id: string;
  retention_years: number;
  legal_hold: boolean;
  updated_at: string;
  created_at: string;
};

type BackupSnapshot = {
  id: string;
  snapshot_kind: string;
  label: string | null;
  period_start: string | null;
  period_end: string | null;
  retain_until: string;
  payload_checksum: string;
  payload_bytes: number | null;
  row_counts: Record<string, number> | null;
  created_by: string | null;
  created_at: string;
  restore_tested_at: string | null;
  restore_test_result: { ok?: boolean } | null;
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? fallback);
  }
  return fallback;
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'okänd';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function parseJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${response.status}`);
  }
  return data;
}

export default function BackupRetentionCard({
  companyId,
  isAdmin,
  canWrite
}: {
  companyId: string;
  isAdmin: boolean;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [label, setLabel] = useState('');
  const [retentionYearsDraft, setRetentionYearsDraft] = useState(7);
  const [legalHoldDraft, setLegalHoldDraft] = useState<'false' | 'true'>('false');

  const queryKey = useMemo(() => ['backup-center', companyId], [companyId]);

  const backupsQuery = useQuery<{ snapshots: BackupSnapshot[]; policy: BackupPolicy | null }>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(`/api/admin/backups?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      const data = await parseJson(response);
      return {
        snapshots: (data.snapshots ?? []) as BackupSnapshot[],
        policy: (data.policy ?? null) as BackupPolicy | null
      };
    }
  });

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          label: label.trim() || null,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null
        })
      });
      return parseJson(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success('Backup skapad');
    },
    onError: (error) => toast.error(toErrorMessage(error, 'Kunde inte skapa backup'))
  });

  const updatePolicyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/backups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          retentionYears: retentionYearsDraft,
          legalHold: legalHoldDraft === 'true'
        })
      });
      return parseJson(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success('Retention-policy sparad');
    },
    onError: (error) => toast.error(toErrorMessage(error, 'Kunde inte spara retention-policy'))
  });

  const restoreTestMutation = useMutation({
    mutationFn: async ({ snapshotId }: { snapshotId: string }) => {
      const response = await fetch(`/api/admin/backups/${snapshotId}/restore-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId })
      });
      return parseJson(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success('Återläsningstest klart');
    },
    onError: (error) => toast.error(toErrorMessage(error, 'Kunde inte köra återläsningstest'))
  });

  const policy = backupsQuery.data?.policy;
  const snapshots = backupsQuery.data?.snapshots ?? [];

  useEffect(() => {
    if (!policy) return;
    setRetentionYearsDraft(policy.retention_years);
    setLegalHoldDraft(policy.legal_hold ? 'true' : 'false');
  }, [policy?.retention_years, policy?.legal_hold]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arkivering, backup och återläsning</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Backup sparas med minst 7 års retention. Du kan skapa snapshot, ladda ner JSON och köra återläsningstest (integritetskontroll utan att skriva tillbaka data).
        </p>

        <div className="grid gap-2 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-sm">Periodstart (valfri)</span>
            <Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Periodslut (valfri)</span>
            <Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Etikett</span>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="t.ex. Bokslut 2026" />
          </label>
          <div className="flex items-end">
            <Button className="w-full" disabled={!canWrite || createBackupMutation.isPending} onClick={() => createBackupMutation.mutate()}>
              {createBackupMutation.isPending ? 'Skapar...' : 'Skapa backup nu'}
            </Button>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-sm">Retention (år)</span>
            <Input
              type="number"
              min={7}
              max={15}
              value={retentionYearsDraft}
              onChange={(event) => setRetentionYearsDraft(Number(event.target.value || 7))}
              disabled={!isAdmin}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Legal hold</span>
            <Select value={legalHoldDraft} onValueChange={(value) => setLegalHoldDraft(value as 'false' | 'true')} disabled={!isAdmin}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false">Av</SelectItem>
                <SelectItem value="true">På</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="text-sm md:col-span-1">
            <p>Aktuell policy</p>
            <p className="text-muted-foreground">
              {policy ? `${policy.retention_years} år, legal hold: ${policy.legal_hold ? 'på' : 'av'}` : 'Ingen policy'}
            </p>
          </div>
          <div className="flex items-end">
            <Button className="w-full" variant="secondary" disabled={!isAdmin || updatePolicyMutation.isPending} onClick={() => updatePolicyMutation.mutate()}>
              {updatePolicyMutation.isPending ? 'Sparar...' : 'Spara retention-policy'}
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              <TableHead>Skapad</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Retain till</TableHead>
              <TableHead>Checksum</TableHead>
              <TableHead>Storlek</TableHead>
              <TableHead>Restore-test</TableHead>
              <TableHead className="text-right">Åtgärder</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">Inga backups skapade än.</TableCell>
              </TableRow>
            ) : (
              snapshots.map((snapshot) => (
                <TableRow key={snapshot.id}>
                  <TableCell>{new Date(snapshot.created_at).toLocaleString('sv-SE')}</TableCell>
                  <TableCell>{snapshot.period_start && snapshot.period_end ? `${snapshot.period_start} -> ${snapshot.period_end}` : 'Hela bolagsdatan'}</TableCell>
                  <TableCell>{snapshot.retain_until}</TableCell>
                  <TableCell className="font-mono text-xs">{snapshot.payload_checksum.slice(0, 16)}...</TableCell>
                  <TableCell>{formatBytes(snapshot.payload_bytes)}</TableCell>
                  <TableCell>
                    {snapshot.restore_tested_at
                      ? `${new Date(snapshot.restore_tested_at).toLocaleString('sv-SE')} (${snapshot.restore_test_result?.ok ? 'OK' : 'Fel'})`
                      : 'Ej testad'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const size = formatBytes(snapshot.payload_bytes);
                          const ok = window.confirm(`Ladda ner backup ${snapshot.id}? Storlek: ${size}`);
                          if (!ok) return;
                          window.open(`/api/admin/backups/${snapshot.id}?companyId=${encodeURIComponent(companyId)}`, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        Ladda ner
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!canWrite || restoreTestMutation.isPending}
                        onClick={() => restoreTestMutation.mutate({ snapshotId: snapshot.id })}
                      >
                        Återläsningstest
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}