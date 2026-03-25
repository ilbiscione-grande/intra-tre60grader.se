'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { enqueueAction, getQueueCounts, processQueue } from '@/features/offline/syncQueue';
import { useOfflineStore } from '@/features/offline/offlineStore';
import { applyProjectStatusAutomation, maybeCreateWatchedStatusTask, maybeCreateWorkflowStatusUpdate } from '@/features/projects/projectAutomation';
import { createProjectWithOrder, moveProject, setProjectStatus } from '@/lib/rpc';
import { PROFILE_AVATAR_BUCKET } from '@/lib/profile/constants';
import { resolveCustomerForPayload, type ProjectCreatePayload } from '@/features/projects/customerResolver';
import type { Database, TableRow as DbRow } from '@/lib/supabase/database.types';
import type { Project, ProjectColumn, ProjectStatus, Role } from '@/lib/types';

const projectKey = (companyId: string) => ['projects', companyId] as const;
const projectColumnsKey = (companyId: string) => ['project-columns', companyId] as const;
const companyMemberDirectoryKey = (companyId: string) => ['company-member-directory', companyId] as const;
const projectTemplatesKey = (companyId: string) => ['project-templates', companyId] as const;

export type CompanyMemberDirectoryEntry = {
  id: string;
  company_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email: string | null;
  handle: string | null;
  display_name: string | null;
};

export type ProjectMemberVisual = CompanyMemberDirectoryEntry & {
  color: string;
  avatar_path: string | null;
  avatar_url: string | null;
  emoji: string | null;
};

type CompanyMemberOptionRpc = Database['public']['Functions']['list_company_member_options']['Returns'][number];

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

export type ProjectActivitySummary = {
  project_id: string;
  at: string;
  actor_user_id: string | null;
  text: string;
};

export type ProjectTemplate = Pick<
  DbRow<'project_templates'>,
  'id' | 'company_id' | 'name' | 'description' | 'start_status' | 'member_user_ids' | 'milestones' | 'task_templates' | 'order_line_templates' | 'created_at' | 'updated_at'
>;

function addDays(baseDate: string, days: number) {
  const date = new Date(`${baseDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function useProjectColumns(companyId: string) {
  return useQuery<ProjectColumn[]>({
    queryKey: projectColumnsKey(companyId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('project_columns')
        .select('id,company_id,key,title,position,bg_color,created_at')
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
        .select('id,company_id,title,status,workflow_status,position,customer_id,start_date,end_date,milestones,responsible_user_id,updated_at,created_at')
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

export function useCompanyMemberOptions(companyId: string) {
  return useQuery<ProjectMemberVisual[]>({
    queryKey: ['company-member-options', companyId],
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .rpc('list_company_member_options', { p_company_id: companyId })
        .returns<CompanyMemberOptionRpc[]>();

      if (error) throw error;

      const baseMembers = (data ?? []).map((member) => ({
        id: member.id,
        company_id: member.company_id,
        user_id: member.user_id,
        role: (member.role === 'finance' || member.role === 'admin' || member.role === 'auditor' || member.role === 'member' ? member.role : 'member') as Role,
        created_at: member.created_at,
        email: member.email,
        handle: member.handle,
        display_name: member.display_name,
        color: member.color ?? '#3b82f6',
        avatar_path: member.avatar_path,
        avatar_url: null,
        emoji: member.emoji
      }));

      return Promise.all(
        baseMembers.map(async (member) => {
          if (!member.avatar_path) return member;

          const { data: signed, error: signedError } = await supabase.storage
            .from(PROFILE_AVATAR_BUCKET)
            .createSignedUrl(member.avatar_path, 60 * 60);

          if (signedError) {
            return member;
          }

          return {
            ...member,
            avatar_url: signed?.signedUrl ?? null
          };
        })
      );
    }
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

export function useProjectTemplates(companyId: string) {
  return useQuery<ProjectTemplate[]>({
    queryKey: projectTemplatesKey(companyId),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('project_templates')
        .select('id,company_id,name,description,start_status,member_user_ids,milestones,task_templates,order_line_templates,created_at,updated_at')
        .eq('company_id', companyId)
        .order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ProjectTemplate[];
    }
  });
}

export function useProjectActivitySummaries(companyId: string) {
  return useQuery<ProjectActivitySummary[]>({
    queryKey: ['project-activity-summaries', companyId],
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient();

      const [updatesResult, tasksResult, timeEntriesResult, membersResult, filesResult] = await Promise.all([
        supabase
          .from('project_updates')
          .select('project_id,created_by,created_at,parent_id')
          .eq('company_id', companyId)
          .returns<Array<Pick<DbRow<'project_updates'>, 'project_id' | 'created_by' | 'created_at' | 'parent_id'>>>(),
        supabase
          .from('project_tasks')
          .select('project_id,created_by,assignee_user_id,title,created_at,updated_at')
          .eq('company_id', companyId)
          .returns<Array<Pick<DbRow<'project_tasks'>, 'project_id' | 'created_by' | 'assignee_user_id' | 'title' | 'created_at' | 'updated_at'>>>(),
        supabase
          .from('project_time_entries')
          .select('project_id,user_id,hours,entry_date,created_at')
          .eq('company_id', companyId)
          .returns<Array<Pick<DbRow<'project_time_entries'>, 'project_id' | 'user_id' | 'hours' | 'entry_date' | 'created_at'>>>(),
        supabase
          .from('project_members')
          .select('project_id,user_id,created_by,created_at')
          .eq('company_id', companyId)
          .returns<Array<Pick<DbRow<'project_members'>, 'project_id' | 'user_id' | 'created_by' | 'created_at'>>>(),
        supabase
          .from('project_files')
          .select('project_id,created_by,created_at,file_name,title,version_no')
          .eq('company_id', companyId)
          .returns<Array<Pick<DbRow<'project_files'>, 'project_id' | 'created_by' | 'created_at' | 'file_name' | 'title' | 'version_no'>>>()
      ]);

      if (updatesResult.error) throw updatesResult.error;
      if (tasksResult.error) throw tasksResult.error;
      if (timeEntriesResult.error) throw timeEntriesResult.error;
      if (membersResult.error) throw membersResult.error;
      if (filesResult.error) throw filesResult.error;

      const events: ProjectActivitySummary[] = [];

      for (const update of updatesResult.data ?? []) {
        events.push({
          project_id: update.project_id,
          at: update.created_at,
          actor_user_id: update.created_by,
          text: update.parent_id ? 'Svar i uppdateringstråd' : 'Ny projektuppdatering'
        });
      }

      for (const task of tasksResult.data ?? []) {
        events.push({
          project_id: task.project_id,
          at: task.created_at,
          actor_user_id: task.created_by,
          text: `Ny uppgift: ${task.title}`
        });

        if (new Date(task.updated_at).getTime() > new Date(task.created_at).getTime() + 1000) {
          events.push({
            project_id: task.project_id,
            at: task.updated_at,
            actor_user_id: task.assignee_user_id ?? task.created_by,
            text: `Uppgift uppdaterad: ${task.title}`
          });
        }
      }

      for (const entry of timeEntriesResult.data ?? []) {
        events.push({
          project_id: entry.project_id,
          at: entry.created_at,
          actor_user_id: entry.user_id,
          text: `Tid rapporterad: ${Number(entry.hours).toFixed(1)} h`
        });
      }

      for (const member of membersResult.data ?? []) {
        events.push({
          project_id: member.project_id,
          at: member.created_at,
          actor_user_id: member.created_by ?? member.user_id,
          text: 'Projektmedlem tilldelad'
        });
      }

      for (const file of filesResult.data ?? []) {
        events.push({
          project_id: file.project_id,
          at: file.created_at,
          actor_user_id: file.created_by,
          text: file.version_no > 1 ? `Ny filversion: ${file.title ?? file.file_name}` : `Fil uppladdad: ${file.title ?? file.file_name}`
        });
      }

      const latestByProject = new Map<string, ProjectActivitySummary>();
      for (const event of events) {
        const current = latestByProject.get(event.project_id);
        if (!current || new Date(event.at).getTime() > new Date(current.at).getTime()) {
          latestByProject.set(event.project_id, event);
        }
      }

      return Array.from(latestByProject.values());
    }
  });
}

export function useCreateProject(companyId: string) {
  const queryClient = useQueryClient();
  const setCounts = useOfflineStore((s) => s.setCounts);

  return useMutation({
    mutationFn: async (payload: ProjectCreatePayload) => {
      const supabase = createClient();
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
      const result = (await createProjectWithOrder(resolved)) as { project_id?: string; order_id?: string } | null;
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const actorUserId = user?.id ?? null;

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

      if (result?.project_id && (payload.task_templates?.length ?? 0) > 0) {
        const taskRows = (payload.task_templates ?? []).map((task) => ({
          company_id: companyId,
          project_id: result.project_id as string,
          title: task.title,
          description: task.description?.trim() || null,
          status: task.status ?? 'todo',
          priority: task.priority ?? 'normal',
          due_date: typeof task.offset_days === 'number' && payload.start_date ? addDays(payload.start_date, task.offset_days) : null,
          assignee_user_id: task.assignee_user_id ?? null,
          milestone_id: task.milestone_id ?? null,
          subtasks: (task.subtasks ?? []).map((subtask) => ({
            id: subtask.id,
            title: subtask.title,
            done: Boolean(subtask.done)
          })),
          created_by: actorUserId
        }));

        const { error } = await supabase.from('project_tasks').insert(taskRows);
        if (error) throw new Error(`Projekt skapades men malluppgifter kunde inte läggas till: ${error.message}`);
      }

      if (result?.order_id && (payload.order_line_templates?.length ?? 0) > 0) {
        const orderLineRows = (payload.order_line_templates ?? []).map((line) => {
          const qty = Number.isFinite(line.qty) ? Number(line.qty) : 1;
          const unitPrice = Number.isFinite(line.unit_price) ? Number(line.unit_price) : 0;
          const vatRate = Number.isFinite(line.vat_rate) ? Number(line.vat_rate) : 25;
          return {
            company_id: companyId,
            order_id: result.order_id as string,
            title: line.title,
            qty,
            unit_price: unitPrice,
            vat_rate: vatRate,
            total: Math.round(qty * unitPrice * 100) / 100
          };
        });

        const { error } = await supabase.from('order_lines').insert(orderLineRows);
        if (error) throw new Error(`Projekt skapades men mallorderrader kunde inte läggas till: ${error.message}`);
      }

      await processQueue(companyId);
      setCounts(await getQueueCounts());
      toast.success('Projekt skapat');
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: projectColumnsKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: ['customers', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['project-members', companyId] });
      await queryClient.invalidateQueries({ queryKey: projectTemplatesKey(companyId) });
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
    },
    onSuccess: async () => {
      await processQueue(companyId);
      setCounts(await getQueueCounts());
      await queryClient.invalidateQueries({ queryKey: projectKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: projectColumnsKey(companyId) });
      toast.success('Status uppdaterad');
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

      let sideEffectError: string | null = null;
      try {
        await maybeCreateWatchedStatusTask({
          companyId,
          projectId: project.id,
          targetStatus: toStatus
        });
      } catch (error) {
        sideEffectError = error instanceof Error ? error.message : 'Kunde inte skapa automatisk uppgift';
      }

      await processQueue(companyId);
      setCounts(await getQueueCounts());
      return { sideEffectError };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: projectKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: projectColumnsKey(companyId) });
      toast.success('Projekt flyttat');
      if (result?.sideEffectError) {
        toast.warning(`Projektet flyttades, men en automation kunde inte köras: ${result.sideEffectError}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte flytta projekt');
    }
  });
}

export function useUpdateProjectWorkflowStatus(companyId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, workflowStatus }: { projectId: string; workflowStatus: string }) => {
      const supabase = createClient();
      const { data: existingProject, error: existingProjectError } = await supabase
        .from('projects')
        .select('workflow_status,status')
        .eq('company_id', companyId)
        .eq('id', projectId)
        .maybeSingle<{ workflow_status: string | null; status: string }>();

      if (existingProjectError) throw existingProjectError;

      const { error } = await supabase
        .from('projects')
        .update({ workflow_status: workflowStatus })
        .eq('company_id', companyId)
        .eq('id', projectId);

      if (error) throw error;

      let workflowUpdateSideEffectError: string | null = null;
      const [automationResult] = await Promise.all([
        applyProjectStatusAutomation({
          companyId,
          projectId,
          workflowStatus
        }),
        maybeCreateWorkflowStatusUpdate({
          companyId,
          projectId,
          previousWorkflowStatus: existingProject?.workflow_status ?? existingProject?.status ?? null,
          nextWorkflowStatus: workflowStatus
        }).catch((error) => {
          workflowUpdateSideEffectError =
            error instanceof Error ? error.message : 'Kunde inte skapa automatisk projektuppdatering';
          return { created: false as const };
        })
      ]);

      return {
        ...automationResult,
        sideEffectError:
          workflowUpdateSideEffectError ?? ('sideEffectError' in automationResult ? automationResult.sideEffectError : null)
      };
    },
    onSuccess: async (automationResult) => {
      await queryClient.invalidateQueries({ queryKey: projectKey(companyId) });
      await queryClient.invalidateQueries({ queryKey: ['project-members', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['project-activity-summaries', companyId] });
      toast.success(
        automationResult?.applied
          ? 'Projektstatus uppdaterad och kortet flyttades enligt regel'
          : 'Projektstatus uppdaterad'
      );
      if (automationResult?.sideEffectError) {
        toast.warning(`Projektstatusen sparades, men en automation kunde inte köras: ${automationResult.sideEffectError}`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera projektstatus');
    }
  });
}
