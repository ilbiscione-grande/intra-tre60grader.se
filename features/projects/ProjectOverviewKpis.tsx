'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock3, FolderKanban, TriangleAlert, UserMinus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { useProjectMembers, useProjects } from '@/features/projects/projectQueries';
import type { Json, TableRow as DbRow } from '@/lib/supabase/database.types';

type ProjectFinancePlanLite = {
  project_id: string;
  budget_hours: number | null;
  budget_revenue: number | null;
  budget_cost: number | null;
};

type ProjectTimeEntryLite = Pick<DbRow<'project_time_entries'>, 'project_id' | 'hours' | 'is_billable'>;

type ProjectMilestone = {
  id: string;
  title: string;
  date: string;
  completed: boolean;
};

function todayIso() {
  return new Date().toLocaleDateString('sv-CA');
}

function normalizeProjectMilestones(value: Json | null | undefined): ProjectMilestone[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      const date = typeof record.date === 'string' ? record.date : '';
      const completed = Boolean(record.completed);
      const id = typeof record.id === 'string' && record.id.trim() ? record.id : `milestone-${index}`;
      if (!title && !date) return null;
      return { id, title, date, completed };
    })
    .filter((item): item is ProjectMilestone => Boolean(item));
}

function KpiCard({
  icon: Icon,
  label,
  value,
  helper
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="border-border/70 bg-muted/10">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{value}</p>
          <p className="mt-2 text-sm text-foreground/65">{helper}</p>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export default function ProjectOverviewKpis({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const projectsQuery = useProjects(companyId);
  const projectMembersQuery = useProjectMembers(companyId);

  const financePlansQuery = useQuery<ProjectFinancePlanLite[]>({
    queryKey: ['project-finance-plans-lite', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('project_finance_plans')
        .select('project_id,budget_hours,budget_revenue,budget_cost')
        .eq('company_id', companyId);

      if (error) throw error;
      return (data ?? []) as ProjectFinancePlanLite[];
    },
    staleTime: 1000 * 60 * 5
  });

  const timeEntriesQuery = useQuery<ProjectTimeEntryLite[]>({
    queryKey: ['project-time-entries-lite', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_time_entries')
        .select('project_id,hours,is_billable')
        .eq('company_id', companyId)
        .returns<ProjectTimeEntryLite[]>();

      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5
  });

  const metrics = useMemo(() => {
    const projects = projectsQuery.data ?? [];
    const assignments = projectMembersQuery.data?.assignments ?? [];
    const plansByProjectId = new Map((financePlansQuery.data ?? []).map((plan) => [plan.project_id, plan]));
    const hoursByProjectId = new Map<string, number>();

    for (const entry of timeEntriesQuery.data ?? []) {
      hoursByProjectId.set(entry.project_id, (hoursByProjectId.get(entry.project_id) ?? 0) + Number(entry.hours ?? 0));
    }

    const today = todayIso();
    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - 7);

    const overdueProjects = projects.filter((project) => {
      if (project.end_date && project.end_date < today) return true;
      const milestones = normalizeProjectMilestones(project.milestones);
      return milestones.some((milestone) => !milestone.completed && milestone.date && milestone.date < today);
    });

    const projectsWithoutOwner = projects.filter(
      (project) => !assignments.some((assignment) => assignment.project_id === project.id && Boolean(assignment.member))
    );

    const riskProjects = projects.filter((project) => {
      const plan = plansByProjectId.get(project.id);
      const actualHours = hoursByProjectId.get(project.id) ?? 0;
      const hasBudget = Boolean((plan?.budget_hours ?? 0) > 0 || (plan?.budget_revenue ?? 0) > 0 || (plan?.budget_cost ?? 0) > 0);
      if (!hasBudget && actualHours > 0) return true;
      if ((plan?.budget_hours ?? 0) > 0 && actualHours > (plan?.budget_hours ?? 0)) return true;
      return false;
    });

    const noBudgetWithActivity = projects.filter((project) => {
      const plan = plansByProjectId.get(project.id);
      const actualHours = hoursByProjectId.get(project.id) ?? 0;
      const hasBudget = Boolean((plan?.budget_hours ?? 0) > 0 || (plan?.budget_revenue ?? 0) > 0 || (plan?.budget_cost ?? 0) > 0);
      return !hasBudget && actualHours > 0;
    });

    const staleProjects = projects.filter((project) => new Date(project.updated_at) < staleCutoff);

    return {
      activeProjects: projects.length,
      overdueProjects: overdueProjects.length,
      projectsWithoutOwner: projectsWithoutOwner.length,
      riskProjects: riskProjects.length,
      noBudgetWithActivity: noBudgetWithActivity.length,
      staleProjects: staleProjects.length
    };
  }, [financePlansQuery.data, projectMembersQuery.data?.assignments, projectsQuery.data, timeEntriesQuery.data]);

  if (projectsQuery.isLoading) {
    return <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"><Card><CardContent className="p-4 text-sm text-foreground/65">Laddar KPI:er...</CardContent></Card></div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard icon={FolderKanban} label="Aktiva projekt" value={String(metrics.activeProjects)} helper="Projekt i bolaget just nu" />
      <KpiCard icon={AlertTriangle} label="Försenade" value={String(metrics.overdueProjects)} helper="Slutdatum eller delmål passerat" />
      <KpiCard icon={UserMinus} label="Utan ansvarig" value={String(metrics.projectsWithoutOwner)} helper="Saknar tilldelad medlem" />
      <KpiCard icon={TriangleAlert} label="Riskprojekt" value={String(metrics.riskProjects)} helper="Över timmar eller saknar budget" />
      <KpiCard icon={Clock3} label="Ingen budget" value={String(metrics.noBudgetWithActivity)} helper="Har aktivitet men ingen satt budget" />
      <KpiCard icon={Clock3} label="Ej uppdaterade" value={String(metrics.staleProjects)} helper="Inte ändrade senaste 7 dagarna" />
    </div>
  );
}
