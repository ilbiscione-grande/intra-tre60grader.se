'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { enqueueAction, getQueueCounts, processQueue } from '@/features/offline/syncQueue';
import { useOfflineStore } from '@/features/offline/offlineStore';
import { createProjectWithOrder, moveProject, setProjectStatus } from '@/lib/rpc';
import { resolveCustomerForPayload, type ProjectCreatePayload } from '@/features/projects/customerResolver';
import type { Project, ProjectColumn, ProjectStatus, Role } from '@/lib/types';

const projectKey = (companyId: string) => ['projects', companyId] as const;
const projectColumnsKey = (companyId: string) => ['project-columns', companyId] as const;
const companyMemberDirectoryKey = (companyId: string) => ['company-member-directory', companyId] as const;

export type CompanyMemberDirectoryEntry = {
  id: string;
  company_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email: string | null;
  handle: string | null;
};

export type ProjectMemberVisual = CompanyMemberDirectoryEntry & {
  color: string;
  avatar_path: string | null;
  avatar_url: string | null;
  emoji: string | null;
};

export type ProjectMemberAssignment = {
  id: string;
  company_id: string;
  project_id: string;
  user_id: string;
  created_by: string | null;
  created_at: string;
  member: ProjectMemberVisual | null;
};

export type ProjectMembersPayload = {
  availableMembers: ProjectMemberVisual[];
  assignments: ProjectMemberAssignment[];
};

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

export function useCompanyMemberDirectory(companyId: string) {
  return useQuery<CompanyMemberDirectoryEntry[]>({
    queryKey: companyMemberDirectoryKey(companyId),
    queryFn: async () => {
      const res = await fetch(`/api/company-members/directory?companyId=${companyId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte läsa medlemmar');
      }

      const body = (await res.json()) as { members?: CompanyMemberDirectoryEntry[] };
      return body.members ?? [];
    },
    staleTime: 1000 * 60 * 10
  });
}

export function useProjectMembers(companyId: string) {
  return useQuery<ProjectMembersPayload>({
    queryKey: ['project-members', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/project-members?companyId=${companyId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte läsa projektmedlemmar');
      }

      return (await res.json()) as ProjectMembersPayload;
    },
    staleTime: 1000 * 60 * 5
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
      const result = (await createProjectWithOrder(resolved)) as { project_id?: string } | null;

      if (result?.project_id && (payload.member_ids?.length ?? 0) > 0) {
        const res = await fetch('/api/project-members', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            companyId,
            projectId: result.project_id,
            userIds: payload.member_ids
          })
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? 'Projekt skapades men medlemmarna kunde inte tilldelas');
        }
      }

      await processQueue(companyId);
      setCounts(await getQueueCounts());
      toast.success('Projekt skapat');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: projectColumnsKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: ['customers', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['project-members', companyId] });
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
