'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';
import type { Role } from '@/lib/types';

type ProjectFinancePlanRow = {
  id: string;
  company_id: string;
  project_id: string;
  cost_center: string | null;
  budget_revenue: number | null;
  budget_cost: number | null;
  note: string | null;
  updated_at: string;
};

type CompanyCostCenterRow = {
  id: string;
  company_id: string;
  name: string;
  active: boolean;
  sort_order: number;
};

type ProjectCostEntryRow = {
  id: string;
  company_id: string;
  project_id: string;
  entry_date: string;
  description: string;
  amount: number;
  supplier: string | null;
  source: string | null;
  created_at: string;
};

type ProjectFinanceSummary = {
  cost_center: string | null;
  budget: { revenue: number; cost: number; margin: number };
  actual: { revenue: number; cost: number; margin: number; margin_pct: number | null };
};

const DEFAULT_COST_CENTER_OPTIONS = [
  '100 - Försäljning',
  '200 - Konsult',
  '300 - Utveckling',
  '400 - Marknad',
  '500 - Administration',
  '600 - Support'
];

const ADD_COST_CENTER_VALUE = '__add_new_cost_center__';

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function ProjectFinancePanel({
  companyId,
  projectId,
  role,
  isLocked = false
}: {
  companyId: string;
  projectId: string;
  role: Role;
  isLocked?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const db = supabase as unknown as {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => any;
  };

  const canRead = role === 'finance' || role === 'admin' || role === 'auditor';
  const canWrite = (role === 'finance' || role === 'admin') && !isLocked;
  const queryClient = useQueryClient();

  const [costCenter, setCostCenter] = useState('');
  const [budgetRevenue, setBudgetRevenue] = useState('0');
  const [budgetCost, setBudgetCost] = useState('0');

  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryDescription, setEntryDescription] = useState('');
  const [entryAmount, setEntryAmount] = useState('0');
  const [entrySupplier, setEntrySupplier] = useState('');

  const planQuery = useQuery<ProjectFinancePlanRow | null>({
    queryKey: ['project-finance-plan', companyId, projectId],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await db
        .from('project_finance_plans')
        .select('id,company_id,project_id,cost_center,budget_revenue,budget_cost,note,updated_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .maybeSingle();
      if (error) throw error;
      return (data as ProjectFinancePlanRow | null) ?? null;
    }
  });

  const companyCostCentersQuery = useQuery<CompanyCostCenterRow[]>({
    queryKey: ['company-cost-centers', companyId],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await db
        .from('company_cost_centers')
        .select('id,company_id,name,active,sort_order')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data as CompanyCostCenterRow[] | null) ?? [];
    }
  });

  const costEntriesQuery = useQuery<ProjectCostEntryRow[]>({
    queryKey: ['project-cost-entries', companyId, projectId],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await db
        .from('project_cost_entries')
        .select('id,company_id,project_id,entry_date,description,amount,supplier,source,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as ProjectCostEntryRow[] | null) ?? [];
    }
  });

  const summaryQuery = useQuery<ProjectFinanceSummary | null>({
    queryKey: ['project-finance-summary', companyId, projectId],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await db.rpc('project_finance_summary', {
        p_company_id: companyId,
        p_project_id: projectId
      });
      if (error) throw error;
      if (!data) return null;
      return data as ProjectFinanceSummary;
    }
  });

  const createCostCenterMutation = useMutation({
    mutationFn: async (rawName: string) => {
      if (!canWrite) throw new Error('Projektet är låst för ekonomiska ändringar');
      const name = rawName.trim();
      if (!name) throw new Error('Namn på kostnadsställe krävs');

      const maxSortOrder = Math.max(0, ...((companyCostCentersQuery.data ?? []).map((row) => Number(row.sort_order ?? 0))));

      const { error } = await db.from('company_cost_centers').upsert(
        {
          company_id: companyId,
          name,
          active: true,
          sort_order: maxSortOrder + 10
        },
        { onConflict: 'company_id,name' }
      );

      if (error) throw error;
      return name;
    },
    onSuccess: async (name) => {
      await queryClient.invalidateQueries({ queryKey: ['company-cost-centers', companyId] });
      setCostCenter(name);
      toast.success('Kostnadsställe tillagt');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa kostnadsställe');
    }
  });

  const savePlanMutation = useMutation({
    mutationFn: async () => {
      if (!canWrite) throw new Error('Projektet är låst för ekonomiska ändringar');
      const payload = {
        company_id: companyId,
        project_id: projectId,
        cost_center: costCenter.trim() || null,
        budget_revenue: Math.max(0, toNumber(budgetRevenue, 0)),
        budget_cost: Math.max(0, toNumber(budgetCost, 0))
      };

      const { error } = await db.from('project_finance_plans').upsert(payload, {
        onConflict: 'company_id,project_id'
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-finance-plan', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-finance-summary', companyId, projectId] });
      toast.success('Projektbudget sparad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte spara projektbudget')
  });

  const addCostEntryMutation = useMutation({
    mutationFn: async () => {
      if (!canWrite) throw new Error('Projektet är låst för ekonomiska ändringar');
      const description = entryDescription.trim();
      if (!description) throw new Error('Beskrivning krävs');

      const payload = {
        company_id: companyId,
        project_id: projectId,
        entry_date: entryDate,
        description,
        amount: Math.max(0, toNumber(entryAmount, 0)),
        supplier: entrySupplier.trim() || null,
        source: 'manual'
      };

      const { error } = await db.from('project_cost_entries').insert(payload);
      if (error) throw error;
    },
    onSuccess: async () => {
      setEntryDescription('');
      setEntryAmount('0');
      setEntrySupplier('');
      await queryClient.invalidateQueries({ queryKey: ['project-cost-entries', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-finance-summary', companyId, projectId] });
      toast.success('Kostnadspost tillagd');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte lägga till kostnadspost')
  });

  const deleteCostEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canWrite) throw new Error('Projektet är låst för ekonomiska ändringar');
      const { error } = await db.from('project_cost_entries').delete().eq('company_id', companyId).eq('id', id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-cost-entries', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-finance-summary', companyId, projectId] });
      toast.success('Kostnadspost borttagen');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte ta bort kostnadspost')
  });

  const plan = planQuery.data;
  const summary = summaryQuery.data;

  useEffect(() => {
    if (!plan) return;
    setCostCenter(plan.cost_center ?? '');
    setBudgetRevenue(String(plan.budget_revenue ?? 0));
    setBudgetCost(String(plan.budget_cost ?? 0));
  }, [plan?.id, plan?.cost_center, plan?.budget_revenue, plan?.budget_cost]);

  const mergedCostCenterOptions = [...new Set([...(companyCostCentersQuery.data ?? []).map((row) => row.name), ...DEFAULT_COST_CENTER_OPTIONS, ...(costCenter ? [costCenter] : [])])];

  async function handleCostCenterSelect(value: string) {
    if (value === ADD_COST_CENTER_VALUE) {
      if (!canWrite) return;
      const name = window.prompt('Nytt kostnadsställe (t.ex. 710 - Projektledning)');
      if (!name || !name.trim()) return;
      await createCostCenterMutation.mutateAsync(name.trim());
      return;
    }

    if (value === 'none') {
      setCostCenter('');
      return;
    }

    setCostCenter(value);
  }

  if (!canRead) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Projekt-ekonomi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/70">Du saknar behörighet att se projekt-ekonomi.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projekt-ekonomi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLocked && <p className="text-sm text-amber-700">Projektet är fakturerat och ekonomiska ändringar är låsta.</p>}

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-sm">Kostnadsställe</span>
            <Select value={costCenter || 'none'} onValueChange={handleCostCenterSelect} disabled={!canWrite}>
              <SelectTrigger>
                <SelectValue placeholder="Välj kostnadsställe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ej valt</SelectItem>
                {mergedCostCenterOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
                {canWrite && <SelectItem value={ADD_COST_CENTER_VALUE}>+ Lägg till nytt...</SelectItem>}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1">
            <span className="text-sm">Budget intäkt</span>
            <Input value={budgetRevenue} onChange={(e) => setBudgetRevenue(e.target.value)} type="number" min="0" step="0.01" disabled={!canWrite} />
          </label>
          <label className="space-y-1">
            <span className="text-sm">Budget kostnad</span>
            <Input value={budgetCost} onChange={(e) => setBudgetCost(e.target.value)} type="number" min="0" step="0.01" disabled={!canWrite} />
          </label>
        </div>

        {canWrite && (
          <div>
            <Button onClick={() => savePlanMutation.mutate()} disabled={savePlanMutation.isPending}>
              {savePlanMutation.isPending ? 'Sparar...' : 'Spara budget'}
            </Button>
          </div>
        )}

        <div className="grid gap-2 md:grid-cols-4">
          <Badge>Utfall intäkt: {Number(summary?.actual?.revenue ?? 0).toFixed(2)} kr</Badge>
          <Badge>Utfall kostnad: {Number(summary?.actual?.cost ?? 0).toFixed(2)} kr</Badge>
          <Badge>Utfall marginal: {Number(summary?.actual?.margin ?? 0).toFixed(2)} kr</Badge>
          <Badge>Marginal %: {summary?.actual?.margin_pct == null ? '-' : `${Number(summary.actual.margin_pct).toFixed(1)}%`}</Badge>
        </div>

        <div className="rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Lägg till kostnadspost</p>
          <div className="grid gap-2 md:grid-cols-4">
            <label className="space-y-1">
              <span className="text-sm">Datum</span>
              <Input value={entryDate} onChange={(e) => setEntryDate(e.target.value)} type="date" disabled={!canWrite} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Beskrivning</span>
              <Input value={entryDescription} onChange={(e) => setEntryDescription(e.target.value)} placeholder="t.ex. underkonsult" disabled={!canWrite} />
            </label>
            <label className="space-y-1">
              <span className="text-sm">Belopp</span>
              <Input value={entryAmount} onChange={(e) => setEntryAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0,00" disabled={!canWrite} />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm">Leverantör</span>
              <Input value={entrySupplier} onChange={(e) => setEntrySupplier(e.target.value)} placeholder="valfritt" disabled={!canWrite} />
            </label>
          </div>
          {canWrite && (
            <Button className="mt-2" onClick={() => addCostEntryMutation.mutate()} disabled={addCostEntryMutation.isPending}>
              {addCostEntryMutation.isPending ? 'Lägger till...' : 'Lägg till kostnad'}
            </Button>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Beskrivning</TableHead>
              <TableHead>Leverantör</TableHead>
              <TableHead>Belopp</TableHead>
              <TableHead className="text-right">Åtgärd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(costEntriesQuery.data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-foreground/70">
                  Inga kostnadsposter ännu.
                </TableCell>
              </TableRow>
            )}

            {(costEntriesQuery.data ?? []).map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>{new Date(entry.entry_date).toLocaleDateString('sv-SE')}</TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell>{entry.supplier ?? '-'}</TableCell>
                <TableCell>{Number(entry.amount).toFixed(2)} kr</TableCell>
                <TableCell className="text-right">
                  {canWrite ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteCostEntryMutation.mutate(entry.id)}
                      disabled={deleteCostEntryMutation.isPending}
                    >
                      Ta bort
                    </Button>
                  ) : (
                    <span className="text-xs text-foreground/60">Läsläge</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}