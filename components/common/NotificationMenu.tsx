'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Bell, RefreshCw } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
type ProjectRow = Pick<DbRow<'projects'>, 'id' | 'title'>;

export default function NotificationMenu({
  companyId,
  compact = false
}: {
  companyId: string;
  compact?: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();

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
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const projectsById = new Map((projectsQuery.data ?? []).map((project) => [project.id, project]));

  async function refreshNotifications() {
    await Promise.all([notificationsQuery.refetch(), projectsQuery.refetch()]);
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
                onClick={() => markAllReadMutation.mutate()}
              >
                Markera alla lästa
              </button>
            ) : null}
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="px-2 py-3 text-sm text-foreground/65">Inga notiser ännu.</div>
        ) : (
          notifications.map((notification) => {
            const project = projectsById.get(notification.project_id);
            const href = `/projects/${notification.project_id}?tab=updates&update=${notification.project_update_id}` as Route;

            return (
              <DropdownMenuItem key={notification.id} asChild>
                <Link
                  href={href}
                  className="block"
                  onClick={() => {
                    if (!notification.read_at) {
                      markReadMutation.mutate(notification.id);
                    }
                  }}
                >
                  <div className="flex w-full items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {notification.kind === 'mention' ? 'Du blev omnämnd' : 'Nytt svar'}
                        </p>
                        {!notification.read_at ? <Badge className="bg-primary/15 text-primary">Ny</Badge> : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-foreground/60">{project?.title ?? 'Projekt'}</p>
                    </div>
                    <p className="shrink-0 text-xs text-foreground/50">
                      {new Date(notification.created_at).toLocaleDateString('sv-SE')}
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
