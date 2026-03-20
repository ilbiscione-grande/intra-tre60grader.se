'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Bell, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';
import type { TableRow as DbRow } from '@/lib/supabase/database.types';

type NotificationRow = DbRow<'project_update_notifications'>;
type ProjectRow = Pick<DbRow<'projects'>, 'id' | 'title' | 'end_date' | 'status' | 'created_at'>;
type AutomationSettingsRow = DbRow<'project_automation_settings'>;
type ProjectUpdateRow = Pick<DbRow<'project_updates'>, 'project_id' | 'created_at'>;
type InvoiceSourceRow = Pick<DbRow<'invoice_sources'>, 'project_id'>;
type MenuNotificationItem =
  | { id: string; kind: 'mention' | 'reply'; title: string; subtitle: string; href: Route; createdAt: string; read: boolean; markReadId?: string }
  | { id: string; kind: 'deadline_overdue' | 'deadline_soon' | 'stale_project' | 'done_without_invoice' | 'watched_status'; title: string; subtitle: string; href: Route; createdAt: string; read: boolean };

function todayIso() {
  return new Date().toLocaleDateString('sv-CA');
}

const DEFAULT_AUTOMATION_SETTINGS = {
  watched_statuses: [] as string[],
  remind_days_before_end: 3,
  stale_days_without_update: 7,
  remind_done_without_invoice: true
};

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function NotificationMenu({
  companyId,
  compact = false
}: {
  companyId: string;
  compact?: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [dismissedPlanningIds, setDismissedPlanningIds] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(`planning-notifications:${companyId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setDismissedPlanningIds(parsed.filter((value): value is string => typeof value === 'string'));
      }
    } catch {}
  }, [companyId]);

  function persistDismissed(next: string[]) {
    setDismissedPlanningIds(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`planning-notifications:${companyId}`, JSON.stringify(next));
    }
  }

  const notificationsQuery = useQuery<NotificationRow[]>({
    queryKey: ['project-update-notifications', companyId],
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_update_notifications')
        .select('id,company_id,project_id,project_update_id,recipient_user_id,actor_user_id,kind,created_at,read_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20)
        .returns<NotificationRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const projectsQuery = useQuery<ProjectRow[]>({
    queryKey: ['notification-projects', companyId, notificationsQuery.data?.map((item) => item.project_id).join('|') ?? 'none'],
    enabled: (notificationsQuery.data?.length ?? 0) > 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const ids = Array.from(new Set((notificationsQuery.data ?? []).map((item) => item.project_id)));
      const { data, error } = await supabase
        .from('projects')
        .select('id,title')
        .eq('company_id', companyId)
        .in('id', ids)
        .returns<ProjectRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const automationSettingsQuery = useQuery<AutomationSettingsRow | null>({
    queryKey: ['project-automation-settings', companyId],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_automation_settings')
        .select('company_id,created_at,updated_at,watched_statuses,remind_days_before_end,stale_days_without_update,remind_done_without_invoice')
        .eq('company_id', companyId)
        .maybeSingle<AutomationSettingsRow>();

      if (error) throw error;
      return data;
    }
  });

  const planningProjectsQuery = useQuery<ProjectRow[]>({
    queryKey: ['deadline-notification-projects', companyId],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,end_date,status,created_at')
        .eq('company_id', companyId)
        .returns<ProjectRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const planningProjectUpdatesQuery = useQuery<ProjectUpdateRow[]>({
    queryKey: ['planning-project-updates', companyId],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_updates')
        .select('project_id,created_at')
        .eq('company_id', companyId)
        .returns<ProjectUpdateRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const invoiceSourcesQuery = useQuery<InvoiceSourceRow[]>({
    queryKey: ['notification-invoice-sources', companyId],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_sources')
        .select('project_id')
        .eq('company_id', companyId)
        .returns<InvoiceSourceRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('project_update_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-update-notifications', companyId] });
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('project_update_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-update-notifications', companyId] });
    }
  });

  const notifications = notificationsQuery.data ?? [];
  const projectsById = new Map((projectsQuery.data ?? []).map((project) => [project.id, project]));
  const automationSettings = automationSettingsQuery.data ?? {
    ...DEFAULT_AUTOMATION_SETTINGS,
    company_id: companyId,
    created_at: '',
    updated_at: ''
  };
  const latestUpdateByProjectId = useMemo(() => {
    const next = new Map<string, string>();
    for (const update of planningProjectUpdatesQuery.data ?? []) {
      const current = next.get(update.project_id);
      if (!current || new Date(update.created_at).getTime() > new Date(current).getTime()) {
        next.set(update.project_id, update.created_at);
      }
    }
    return next;
  }, [planningProjectUpdatesQuery.data]);
  const invoicedProjectIds = useMemo(
    () => new Set((invoiceSourcesQuery.data ?? []).map((item) => item.project_id)),
    [invoiceSourcesQuery.data]
  );
  const planningNotifications = useMemo(() => {
    const today = todayIso();
    const remindUntil = addDays(today, automationSettings.remind_days_before_end ?? DEFAULT_AUTOMATION_SETTINGS.remind_days_before_end);
    const staleThreshold = addDays(today, -(automationSettings.stale_days_without_update ?? DEFAULT_AUTOMATION_SETTINGS.stale_days_without_update));

    return (planningProjectsQuery.data ?? []).flatMap((project) => {
      const items: MenuNotificationItem[] = [];

      if (project.end_date && project.status !== 'done' && project.end_date < today) {
        const id = `deadline-overdue:${project.id}:${project.end_date}`;
        items.push({
          id,
          kind: 'deadline_overdue',
          title: 'Projekt har passerat slutdatum',
          subtitle: `${project.title} • slutdatum ${new Date(project.end_date).toLocaleDateString('sv-SE')}`,
          href: `/projects/${project.id}?tab=planning` as Route,
          createdAt: project.end_date,
          read: dismissedPlanningIds.includes(id)
        });
      }

      if (project.end_date && project.status !== 'done' && remindUntil && project.end_date >= today && project.end_date <= remindUntil) {
        const id = `deadline-soon:${project.id}:${project.end_date}`;
        items.push({
          id,
          kind: 'deadline_soon',
          title: 'Slutdatum närmar sig',
          subtitle: `${project.title} • slutdatum ${new Date(project.end_date).toLocaleDateString('sv-SE')}`,
          href: `/projects/${project.id}?tab=planning` as Route,
          createdAt: project.end_date,
          read: dismissedPlanningIds.includes(id)
        });
      }

      if ((automationSettings.watched_statuses ?? []).includes(project.status)) {
        const id = `watched-status:${project.id}:${project.status}`;
        items.push({
          id,
          kind: 'watched_status',
          title: 'Projekt i bevakad kolumn',
          subtitle: `${project.title} • ${project.status}`,
          href: `/projects/${project.id}` as Route,
          createdAt: project.created_at,
          read: dismissedPlanningIds.includes(id)
        });
      }

      const lastUpdate = latestUpdateByProjectId.get(project.id);
      const staleFrom = lastUpdate ?? project.created_at;
      if (project.status !== 'done' && staleThreshold && staleFrom.slice(0, 10) <= staleThreshold) {
        const id = `stale-project:${project.id}:${staleThreshold}`;
        items.push({
          id,
          kind: 'stale_project',
          title: 'Projekt saknar ny uppdatering',
          subtitle: `${project.title} • ingen ny projektuppdatering på ${automationSettings.stale_days_without_update} dagar`,
          href: `/projects/${project.id}?tab=updates` as Route,
          createdAt: staleFrom,
          read: dismissedPlanningIds.includes(id)
        });
      }

      if (automationSettings.remind_done_without_invoice && project.status === 'done' && !invoicedProjectIds.has(project.id)) {
        const id = `done-without-invoice:${project.id}`;
        items.push({
          id,
          kind: 'done_without_invoice',
          title: 'Klart projekt saknar faktura',
          subtitle: `${project.title} • följ upp fakturering`,
          href: `/projects/${project.id}?tab=economy` as Route,
          createdAt: project.created_at,
          read: dismissedPlanningIds.includes(id)
        });
      }

      return items;
    });
  }, [automationSettings, companyId, dismissedPlanningIds, invoicedProjectIds, latestUpdateByProjectId, planningProjectsQuery.data]);
  const projectNotifications = notifications.map((notification) => {
    const project = projectsById.get(notification.project_id);
    return {
      id: notification.id,
      kind: notification.kind === 'mention' ? 'mention' : 'reply',
      title: notification.kind === 'mention' ? 'Du blev omnämnd' : 'Nytt svar',
      subtitle: project?.title ?? 'Projekt',
      href: `/projects/${notification.project_id}?tab=updates&update=${notification.project_update_id}` as Route,
      createdAt: notification.created_at,
      read: Boolean(notification.read_at),
      markReadId: notification.id
    } satisfies MenuNotificationItem;
  });
  const menuNotifications = [...planningNotifications, ...projectNotifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const unreadCount = menuNotifications.filter((item) => !item.read).length;

  async function refreshNotifications() {
    await Promise.all([
      notificationsQuery.refetch(),
      projectsQuery.refetch(),
      planningProjectsQuery.refetch(),
      planningProjectUpdatesQuery.refetch(),
      invoiceSourcesQuery.refetch(),
      automationSettingsQuery.refetch()
    ]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" className="relative h-10 w-10 rounded-full" aria-label="Notiser">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[320px]">
        <div className="flex items-center justify-between px-2 py-2">
          <p className="text-sm font-medium">Notiser</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-foreground/60 transition hover:text-foreground"
              onClick={() => void refreshNotifications()}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${notificationsQuery.isFetching ? 'animate-spin' : ''}`} />
              Uppdatera
            </button>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-xs text-foreground/60 transition hover:text-foreground"
                onClick={() => {
                  markAllReadMutation.mutate();
                  persistDismissed(Array.from(new Set([...dismissedPlanningIds, ...planningNotifications.map((item) => item.id)])));
                }}
              >
                Markera alla lästa
              </button>
            ) : null}
          </div>
        </div>

        {menuNotifications.length === 0 ? (
          <div className="px-2 py-3 text-sm text-foreground/65">Inga notiser ännu.</div>
        ) : (
          menuNotifications.map((notification) => {
            return (
              <DropdownMenuItem key={notification.id} asChild>
                <Link
                  href={notification.href}
                  className="block"
                  onClick={() => {
                    if (notification.kind === 'deadline_overdue') {
                      persistDismissed(Array.from(new Set([...dismissedPlanningIds, notification.id])));
                    } else if (!notification.read && 'markReadId' in notification && notification.markReadId) {
                      markReadMutation.mutate(notification.markReadId);
                    }
                  }}
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{notification.title}</p>
                        {!notification.read ? (
                          <Badge className={notification.kind === 'deadline_overdue' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-200' : 'bg-primary/15 text-primary'}>
                            Ny
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-foreground/60">{notification.subtitle}</p>
                    </div>
                    <p className="shrink-0 text-xs text-foreground/50">
                      {new Date(notification.createdAt).toLocaleDateString('sv-SE')}
                    </p>
                  </div>
                </Link>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
