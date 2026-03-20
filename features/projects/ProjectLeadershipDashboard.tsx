'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Clock3, ReceiptText, TriangleAlert, Users } from 'lucide-react';
import ProfileBadge from '@/components/common/ProfileBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { useCompanyMemberDirectory, useProjectActivitySummaries, useProjectMembers, useProjects } from '@/features/projects/projectQueries';
import type { Json, TableRow as DbRow } from '@/lib/supabase/database.types';

type ProjectFinancePlanLite = {
  project_id: string;
  budget_hours: number | null;
  budget_revenue: number | null;
  budget_cost: number | null;
};

type ProjectTimeEntryLite = Pick<DbRow<'project_time_entries'>, 'project_id' | 'user_id' | 'hours' | 'entry_date' | 'is_billable'>;
type InvoiceSourceLite = Pick<DbRow<'invoice_sources'>, 'project_id'>;

type ProjectMilestone = {
  id: string;
  title: string;
  date: string;
  completed: boolean;
};

function todayIso() {
  return new Date().toLocaleDateString('sv-CA');
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString('sv-CA');
}

function toIsoDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
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

function roleLabel(role: string) {
  const map: Record<string, string> = {
    member: 'Medlem',
    finance: 'Ekonomi',
    admin: 'Admin',
    auditor: 'Revisor'
  };
  return map[role] ?? role;
}

function DashboardList({
  title,
  icon: Icon,
  emptyText,
  items
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  emptyText: string;
  items: Array<{ id: string; title: string; helper: string; href: Route }>;
}) {
  return (
    <Card className="border-border/70 bg-muted/10">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-lg bg-background/60 p-3 text-sm text-foreground/65">{emptyText}</p>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block rounded-xl border border-border/70 bg-background/60 p-3 transition hover:border-primary/40 hover:bg-background"
            >
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-foreground/65">{item.helper}</p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectLeadershipDashboard({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const projectsQuery = useProjects(companyId);
  const projectMembersQuery = useProjectMembers(companyId);
  const activitySummariesQuery = useProjectActivitySummaries(companyId);
  const memberDirectoryQuery = useCompanyMemberDirectory(companyId);

  const financePlansQuery = useQuery<ProjectFinancePlanLite[]>({
    queryKey: ['project-finance-plans-lite-dashboard', companyId],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as never as { from: (table: string) => any })
        .from('project_finance_plans')
        .select('project_id,budget_hours,budget_revenue,budget_cost')
        .eq('company_id', companyId);

      if (error) throw error;
      return (data ?? []) as ProjectFinancePlanLite[];
    }
  });

  const timeEntriesQuery = useQuery<ProjectTimeEntryLite[]>({
    queryKey: ['project-time-entries-dashboard', companyId],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_time_entries')
        .select('project_id,user_id,hours,entry_date,is_billable')
        .eq('company_id', companyId)
        .returns<ProjectTimeEntryLite[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const invoiceSourcesQuery = useQuery<InvoiceSourceLite[]>({
    queryKey: ['invoice-sources-dashboard', companyId],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_sources')
        .select('project_id')
        .eq('company_id', companyId)
        .returns<InvoiceSourceLite[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const data = useMemo(() => {
    const projects = projectsQuery.data ?? [];
    const assignments = projectMembersQuery.data?.assignments ?? [];
    const activitySummaries = activitySummariesQuery.data ?? [];
    const financePlansByProject = new Map((financePlansQuery.data ?? []).map((plan) => [plan.project_id, plan]));
    const latestActivityByProject = new Map(activitySummaries.map((item) => [item.project_id, item]));
    const invoicedProjectIds = new Set((invoiceSourcesQuery.data ?? []).map((item) => item.project_id));
    const memberByUserId = new Map((memberDirectoryQuery.data ?? []).map((member) => [member.user_id, member]));
    const today = todayIso();
    const staleCutoff = daysAgoIso(7);
    const last7Days = daysAgoIso(6);

    const hoursByProjectId = new Map<string, number>();
    const hoursByMemberId = new Map<string, { total: number; billable: number; internal: number; projectIds: Set<string> }>();

    for (const entry of timeEntriesQuery.data ?? []) {
      const hours = Number(entry.hours ?? 0);
      hoursByProjectId.set(entry.project_id, (hoursByProjectId.get(entry.project_id) ?? 0) + hours);
      if (entry.entry_date >= last7Days) {
        const current = hoursByMemberId.get(entry.user_id) ?? { total: 0, billable: 0, internal: 0, projectIds: new Set<string>() };
        current.total += hours;
        if (entry.is_billable) current.billable += hours;
        else current.internal += hours;
        current.projectIds.add(entry.project_id);
        hoursByMemberId.set(entry.user_id, current);
      }
    }

    const overdueProjects = projects
      .filter((project) => {
        if (project.end_date && project.end_date < today) return true;
        return normalizeProjectMilestones(project.milestones).some((milestone) => !milestone.completed && milestone.date && milestone.date < today);
      })
      .map((project) => ({
        id: project.id,
        title: project.title,
        helper: project.end_date ? `Slutdatum ${new Date(project.end_date).toLocaleDateString('sv-SE')}` : 'Försenat delmål',
        href: `/projects/${project.id}?tab=planning` as Route
      }));

    const staleProjects = projects
      .filter((project) => {
        const latestActivity = latestActivityByProject.get(project.id)?.at ?? project.updated_at ?? null;
        const latestActivityDate = toIsoDate(latestActivity);
        if (!latestActivityDate) return false;
        return latestActivityDate <= staleCutoff;
      })
      .map((project) => ({
        id: project.id,
        title: project.title,
        helper: `Ingen uppdatering senaste 7 dagarna`,
        href: `/projects/${project.id}?tab=updates` as Route
      }));

    const doneWithoutInvoiceProjects = projects
      .filter((project) => project.status === 'done' && !invoicedProjectIds.has(project.id))
      .map((project) => ({
        id: project.id,
        title: project.title,
        helper: 'Projekt klart men faktura saknas',
        href: `/projects/${project.id}?tab=economy` as Route
      }));

    const riskProjects = projects
      .filter((project) => {
        const plan = financePlansByProject.get(project.id);
        const actualHours = hoursByProjectId.get(project.id) ?? 0;
        const hasBudget = Boolean((plan?.budget_hours ?? 0) > 0 || (plan?.budget_revenue ?? 0) > 0 || (plan?.budget_cost ?? 0) > 0);
        if (!hasBudget && actualHours > 0) return true;
        if ((plan?.budget_hours ?? 0) > 0 && actualHours > (plan?.budget_hours ?? 0)) return true;
        return false;
      })
      .map((project) => {
        const plan = financePlansByProject.get(project.id);
        const actualHours = hoursByProjectId.get(project.id) ?? 0;
        return {
          id: project.id,
          title: project.title,
          helper:
            (plan?.budget_hours ?? 0) > 0
              ? `${actualHours.toFixed(1)} h av ${(plan?.budget_hours ?? 0).toFixed(1)} h`
              : `Aktivitet utan satt budget`,
          href: `/projects/${project.id}?tab=economy` as Route
        };
      });

    const projectsWithoutOwner = projects.filter(
      (project) => !assignments.some((assignment) => assignment.project_id === project.id && Boolean(assignment.member))
    ).length;

    const teamLoad = Array.from(hoursByMemberId.entries())
      .map(([userId, info]) => {
        const member = memberByUserId.get(userId);
        return {
          userId,
          label: member?.email ?? userId,
          color: null,
          avatarUrl: null,
          emoji: null,
          role: member?.role ?? 'member',
          totalHours: info.total,
          billableHours: info.billable,
          internalHours: info.internal,
          projectCount: info.projectIds.size
        };
      })
      .sort((a, b) => b.totalHours - a.totalHours);

    return {
      activeProjects: projects.length,
      overdueCount: overdueProjects.length,
      noOwnerCount: projectsWithoutOwner,
      staleCount: staleProjects.length,
      doneWithoutInvoiceCount: doneWithoutInvoiceProjects.length,
      riskCount: riskProjects.length,
      overdueProjects,
      staleProjects,
      doneWithoutInvoiceProjects,
      riskProjects,
      teamLoad
    };
  }, [
    activitySummariesQuery.data,
    financePlansQuery.data,
    invoiceSourcesQuery.data,
    memberDirectoryQuery.data,
    projectMembersQuery.data?.assignments,
    projectsQuery.data,
    timeEntriesQuery.data
  ]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card className="border-border/70 bg-muted/10"><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Aktiva projekt</p><p className="mt-2 text-2xl font-semibold">{data.activeProjects}</p></CardContent></Card>
        <Card className="border-border/70 bg-muted/10"><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Försenade</p><p className="mt-2 text-2xl font-semibold">{data.overdueCount}</p></CardContent></Card>
        <Card className="border-border/70 bg-muted/10"><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Utan ansvarig</p><p className="mt-2 text-2xl font-semibold">{data.noOwnerCount}</p></CardContent></Card>
        <Card className="border-border/70 bg-muted/10"><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Klara ej fakturerade</p><p className="mt-2 text-2xl font-semibold">{data.doneWithoutInvoiceCount}</p></CardContent></Card>
        <Card className="border-border/70 bg-muted/10"><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-foreground/45">Riskprojekt</p><p className="mt-2 text-2xl font-semibold">{data.riskCount}</p></CardContent></Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardList
          title="Försenade projekt"
          icon={AlertTriangle}
          emptyText="Inga försenade projekt just nu."
          items={data.overdueProjects}
        />
        <DashboardList
          title="Ingen ny uppdatering"
          icon={Clock3}
          emptyText="Alla projekt har nylig aktivitet."
          items={data.staleProjects}
        />
        <DashboardList
          title="Klara men ej fakturerade"
          icon={ReceiptText}
          emptyText="Inga klara projekt väntar på faktura."
          items={data.doneWithoutInvoiceProjects}
        />
        <DashboardList
          title="Risk och budgetavvikelse"
          icon={TriangleAlert}
          emptyText="Inga riskprojekt just nu."
          items={data.riskProjects}
        />
      </div>

      <Card className="border-border/70 bg-muted/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            Teambelastning senaste 7 dagarna
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.teamLoad.length === 0 ? (
            <p className="rounded-lg bg-background/60 p-3 text-sm text-foreground/65">Ingen tid rapporterad ännu.</p>
          ) : (
            data.teamLoad.map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileBadge
                    label={member.label}
                    color={member.color}
                    avatarUrl={member.avatarUrl}
                    emoji={member.emoji}
                    className="h-9 w-9 shrink-0"
                    textClassName="text-xs font-semibold text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.label}</p>
                    <p className="text-xs text-foreground/60">{roleLabel(member.role)}</p>
                  </div>
                </div>
                <div className="grid shrink-0 gap-1 text-right text-xs text-foreground/65">
                  <span>{member.totalHours.toFixed(1)} h totalt</span>
                  <span>{member.billableHours.toFixed(1)} h fakturerbart</span>
                  <span>{member.projectCount} projekt</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
