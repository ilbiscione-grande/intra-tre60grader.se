'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeProjectStatusMoveRules, type ProjectStatusMoveRule } from '@/features/projects/projectAutomation';
import { useProjectColumns } from '@/features/projects/projectQueries';
import { createClient } from '@/lib/supabase/client';
import type { TableRow } from '@/lib/supabase/database.types';

type ProjectAutomationSettingsRow = TableRow<'project_automation_settings'>;

const DEFAULT_SETTINGS = {
  watched_statuses: [] as string[],
  remind_days_before_end: 3,
  stale_days_without_update: 7,
  remind_done_without_invoice: true,
  status_move_rules: [] as ProjectStatusMoveRule[]
};

export default function ProjectAutomationCard({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const columnsQuery = useProjectColumns(companyId);
  const settingsQuery = useQuery<ProjectAutomationSettingsRow | null>({
    queryKey: ['project-automation-settings', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_automation_settings')
        .select('company_id,created_at,updated_at,watched_statuses,remind_days_before_end,stale_days_without_update,remind_done_without_invoice,status_move_rules')
        .eq('company_id', companyId)
        .maybeSingle<ProjectAutomationSettingsRow>();

      if (error) throw error;
      return data;
    }
  });

  const [watchedStatuses, setWatchedStatuses] = useState<string[]>([]);
  const [remindDaysBeforeEnd, setRemindDaysBeforeEnd] = useState('3');
  const [staleDaysWithoutUpdate, setStaleDaysWithoutUpdate] = useState('7');
  const [remindDoneWithoutInvoice, setRemindDoneWithoutInvoice] = useState(true);
  const [statusMoveRules, setStatusMoveRules] = useState<ProjectStatusMoveRule[]>([]);

  useEffect(() => {
    const next = settingsQuery.data;
    if (!next) return;
    setWatchedStatuses(next.watched_statuses ?? []);
    setRemindDaysBeforeEnd(String(next.remind_days_before_end ?? DEFAULT_SETTINGS.remind_days_before_end));
    setStaleDaysWithoutUpdate(String(next.stale_days_without_update ?? DEFAULT_SETTINGS.stale_days_without_update));
    setRemindDoneWithoutInvoice(next.remind_done_without_invoice ?? DEFAULT_SETTINGS.remind_done_without_invoice);
    setStatusMoveRules(normalizeProjectStatusMoveRules(next.status_move_rules));
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: companyId,
        watched_statuses: watchedStatuses,
        remind_days_before_end: Number(remindDaysBeforeEnd || DEFAULT_SETTINGS.remind_days_before_end),
        stale_days_without_update: Number(staleDaysWithoutUpdate || DEFAULT_SETTINGS.stale_days_without_update),
        remind_done_without_invoice: remindDoneWithoutInvoice,
        status_move_rules: statusMoveRules
      };

      const { error } = await supabase.from('project_automation_settings').upsert(payload, { onConflict: 'company_id' });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-automation-settings', companyId] });
      toast.success('Projektregler sparade');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara projektregler');
    }
  });

  const columns = columnsQuery.data ?? [];
  const availableStatuses = columns.map((column) => ({ key: column.key, title: column.title }));

  function addStatusMoveRule() {
    if (availableStatuses.length < 2) return;
    const first = availableStatuses[0]?.key ?? '';
    const second = availableStatuses[1]?.key ?? first;
    setStatusMoveRules((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        from_status: first,
        to_status: second,
        enabled: true
      }
    ]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projektregler och påminnelser</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Välj vilka kolumner som ska bevakas och när projekt ska börja flaggas för slutdatum, inaktivitet och klar-men-ej-fakturerad status.
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium">Bevakade kolumner</p>
          <div className="flex flex-wrap gap-2">
            {columns.map((column) => {
              const active = watchedStatuses.includes(column.key);
              return (
                <button
                  key={column.id}
                  type="button"
                  onClick={() =>
                    setWatchedStatuses((current) =>
                      active ? current.filter((value) => value !== column.key) : [...current, column.key]
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/65'
                  }`}
                >
                  {column.title}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm">Påminn innan slutdatum (dagar)</span>
            <Input type="number" min={0} max={60} value={remindDaysBeforeEnd} onChange={(event) => setRemindDaysBeforeEnd(event.target.value)} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Påminn vid utebliven uppdatering (dagar)</span>
            <Input type="number" min={1} max={90} value={staleDaysWithoutUpdate} onChange={(event) => setStaleDaysWithoutUpdate(event.target.value)} />
          </label>
        </div>

        <label className="flex items-center gap-3 rounded-lg border p-3">
          <input
            type="checkbox"
            checked={remindDoneWithoutInvoice}
            onChange={(event) => setRemindDoneWithoutInvoice(event.target.checked)}
          />
          <span className="text-sm">Påminn när projekt är klart men ännu inte fakturerat</span>
        </label>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Automatiserade statusflöden</p>
              <p className="text-sm text-muted-foreground">
                Enkel första version: när ett projekt sätts till en viss status flyttas det automatiskt vidare till vald kolumn.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={addStatusMoveRule} disabled={availableStatuses.length < 2}>
              Lägg till regel
            </Button>
          </div>

          {statusMoveRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga automatiserade statusflöden ännu.</p>
          ) : (
            <div className="space-y-3">
              {statusMoveRules.map((rule) => (
                <div key={rule.id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1fr_auto_auto]">
                  <label className="space-y-1">
                    <span className="text-sm">När status sätts till</span>
                    <Select
                      value={rule.from_status}
                      onValueChange={(value) =>
                        setStatusMoveRules((current) =>
                          current.map((item) => (item.id === rule.id ? { ...item, from_status: value } : item))
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Välj kolumn" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStatuses.map((column) => (
                          <SelectItem key={`${rule.id}-from-${column.key}`} value={column.key}>
                            {column.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm">Flytta till kolumn</span>
                    <Select
                      value={rule.to_status}
                      onValueChange={(value) =>
                        setStatusMoveRules((current) =>
                          current.map((item) => (item.id === rule.id ? { ...item, to_status: value } : item))
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Välj kolumn" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStatuses.map((column) => (
                          <SelectItem key={`${rule.id}-to-${column.key}`} value={column.key}>
                            {column.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) =>
                        setStatusMoveRules((current) =>
                          current.map((item) => (item.id === rule.id ? { ...item, enabled: event.target.checked } : item))
                        )
                      }
                    />
                    <span className="text-sm">Aktiv</span>
                  </label>

                  <div className="flex items-end justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStatusMoveRules((current) => current.filter((item) => item.id !== rule.id))}
                    >
                      Ta bort
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Sparar...' : 'Spara regler'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
