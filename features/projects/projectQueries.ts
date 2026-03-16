'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { enqueueAction, getQueueCounts, processQueue } from '@/features/offline/syncQueue';
import { useOfflineStore } from '@/features/offline/offlineStore';
import { createProjectWithOrder, moveProject, setProjectStatus } from '@/lib/rpc';
import { resolveCustomerForPayload, type ProjectCreatePayload } from '@/features/projects/customerResolver';
import type { Project, ProjectColumn, ProjectStatus } from '@/lib/types';

const projectKey = (companyId: string) => ['projects', companyId] as const;
const projectColumnsKey = (companyId: string) => ['project-columns', companyId] as const;

export function useProjectColumns(companyId: string) {
  return useQuery<ProjectColumn[]>({
    queryKey: projectColumnsKey(companyId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('project_columns')
        .select('id,company_id,key,title,position,created_at')
        .eq('company_id', companyId)
        .order('position', { ascending: true })
        .returns<ProjectColumn[]>();

      if (error) throw error;
      return data ?? [];
    }
  });
}

export function useProjects(companyId: string) {
  return useQuery<Project[]>({
    queryKey: projectKey(companyId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('projects')
        .select('id,company_id,title,status,position,customer_id,updated_at,created_at')
        .eq('company_id', companyId)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Project[];
    }
  });
}

export function useCreateProject(companyId: string) {
  const queryClient = useQueryClient();
  const setCounts = useOfflineStore((s) => s.setCounts);

  return useMutation({
    mutationFn: async (payload: ProjectCreatePayload) => {
      const basePayload: ProjectCreatePayload & { company_id: string } = {
        ...payload,
        company_id: companyId
      };

      if (!navigator.onLine) {
        await enqueueAction({
          company_id: companyId,
          type: 'CREATE_PROJECT',
          payload: basePayload
        });
        setCounts(await getQueueCounts());
        toast.info('Projekt köat offline');
        return;
      }

      const resolved = await resolveCustomerForPayload(companyId, basePayload);
      await createProjectWithOrder(resolved);
      await processQueue(companyId);
      setCounts(await getQueueCounts());
      toast.success('Projekt skapat');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: projectColumnsKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: ['customers', companyId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa projekt');
    }
  });
}

export function useSetProjectStatus(companyId: string) {
  const queryClient = useQueryClient();
  const setCounts = useOfflineStore((s) => s.setCounts);

  return useMutation({
    mutationFn: async ({ project, toStatus }: { project: Project; toStatus: ProjectStatus }) => {
      if (!navigator.onLine) {
        await enqueueAction({
          company_id: companyId,
          type: 'SET_PROJECT_STATUS',
          project_id: project.id,
          payload: { to_status: toStatus },
          baseUpdatedAt: project.updated_at
        });

        setCounts(await getQueueCounts());
        toast.info('Ändring köad offline');
        return;
      }

      await setProjectStatus(project.id, toStatus);
      await processQueue(companyId);
      setCounts(await getQueueCounts());
      toast.success('Status uppdaterad');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: projectColumnsKey(companyId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ändra status');
    }
  });
}

export function useMoveProject(companyId: string) {
  const queryClient = useQueryClient();
  const setCounts = useOfflineStore((s) => s.setCounts);

  return useMutation({
    mutationFn: async ({
      project,
      toStatus,
      toPosition
    }: {
      project: Project;
      toStatus: ProjectStatus;
      toPosition: number;
    }) => {
      if (!navigator.onLine) {
        await enqueueAction({
          company_id: companyId,
          type: 'MOVE_PROJECT',
          project_id: project.id,
          payload: { to_status: toStatus, to_position: toPosition },
          baseUpdatedAt: project.updated_at
        });

        setCounts(await getQueueCounts());
        toast.info('Flytt köad offline');
        return;
      }

      await moveProject(project.id, toStatus, toPosition);
      await processQueue(companyId);
      setCounts(await getQueueCounts());
      toast.success('Projekt flyttat');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: projectColumnsKey(companyId) });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte flytta projekt');
    }
  });
}
