'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ActionSheet from '@/components/common/ActionSheet';
import ProfileBadge from '@/components/common/ProfileBadge';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { createClient } from '@/lib/supabase/client';
import {
  useCompanyMemberDirectory,
  useCreateProject,
  useProjectColumns,
  useProjectMembers,
  useProjectTemplates,
  type ProjectMemberVisual,
  type ProjectTemplate
} from '@/features/projects/projectQueries';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CreateProjectFormData = {
  title: string;
  status: string;
  templateId?: string;
  customerSelect?: string;
  newCustomerName?: string;
  startDate?: string;
  endDate?: string;
  orderTotal: number;
  responsibleUserId?: string;
  memberIds: string[];
};

type CustomerItem = { id: string; name: string };
type ColumnItem = { key: string; title: string };
type TemplateMilestone = { id: string; title: string; offset_days: number | null };
type TemplateTask = {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'normal' | 'high';
  assignee_user_id: string | null;
  milestone_id: string | null;
  offset_days: number | null;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
};
type TemplateOrderLine = {
  id: string;
  title: string;
  qty: number;
  unit_price: number;
  vat_rate: number;
};

const NEW_CUSTOMER_VALUE = '__new__';
const NO_TEMPLATE_VALUE = '__none__';

function toTemplateMilestones(value: ProjectTemplate['milestones']): TemplateMilestone[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      const offsetDays =
        typeof record.offset_days === 'number'
          ? record.offset_days
          : typeof record.offset_days === 'string' && record.offset_days.trim()
            ? Number(record.offset_days)
            : null;

      if (!title) return null;
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : `template-milestone-${index}`,
        title,
        offset_days: Number.isFinite(offsetDays) ? Number(offsetDays) : null
      };
    })
    .filter((item): item is TemplateMilestone => item !== null);
}

function addDays(baseDate: string, days: number) {
  if (!baseDate) return '';
  const date = new Date(`${baseDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildProjectMilestonesFromTemplate(template: ProjectTemplate | null, startDate?: string) {
  if (!template) return undefined;

  return toTemplateMilestones(template.milestones).map((milestone) => ({
    id: milestone.id,
    title: milestone.title,
    date: typeof milestone.offset_days === 'number' && startDate ? addDays(startDate, milestone.offset_days) : '',
    completed: false
  }));
}

function buildProjectTasksFromTemplate(template: ProjectTemplate | null): TemplateTask[] | undefined {
  if (!template || !Array.isArray(template.task_templates)) return undefined;
  return template.task_templates
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      if (!title) return null;
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : `task-${index}`,
        title,
        description: typeof record.description === 'string' ? record.description : null,
        priority:
          record.priority === 'low' || record.priority === 'high' || record.priority === 'normal'
            ? record.priority
            : 'normal',
        assignee_user_id: typeof record.assignee_user_id === 'string' ? record.assignee_user_id : null,
        milestone_id: typeof record.milestone_id === 'string' ? record.milestone_id : null,
        offset_days:
          typeof record.offset_days === 'number'
            ? record.offset_days
            : typeof record.offset_days === 'string' && record.offset_days.trim()
              ? Number(record.offset_days)
              : null,
        subtasks: Array.isArray(record.subtasks)
          ? record.subtasks
              .map((subtask, subIndex) => {
                if (!subtask || typeof subtask !== 'object' || Array.isArray(subtask)) return null;
                const subRecord = subtask as Record<string, unknown>;
                const subTitle = typeof subRecord.title === 'string' ? subRecord.title.trim() : '';
                if (!subTitle) return null;
                return {
                  id: typeof subRecord.id === 'string' && subRecord.id.trim() ? subRecord.id : `subtask-${subIndex}`,
                  title: subTitle,
                  done: Boolean(subRecord.done)
                };
              })
              .filter((subtask): subtask is { id: string; title: string; done: boolean } => subtask !== null)
          : []
      } satisfies TemplateTask;
    })
    .filter((item): item is TemplateTask => item !== null);
}

function buildOrderLinesFromTemplate(template: ProjectTemplate | null): TemplateOrderLine[] | undefined {
  if (!template || !Array.isArray(template.order_line_templates)) return undefined;
  return template.order_line_templates
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      if (!title) return null;
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : `line-${index}`,
        title,
        qty:
          typeof record.qty === 'number'
            ? record.qty
            : typeof record.qty === 'string' && record.qty.trim()
              ? Number(record.qty)
              : 1,
        unit_price:
          typeof record.unit_price === 'number'
            ? record.unit_price
            : typeof record.unit_price === 'string' && record.unit_price.trim()
              ? Number(record.unit_price)
              : 0,
        vat_rate:
          typeof record.vat_rate === 'number'
            ? record.vat_rate
            : typeof record.vat_rate === 'string' && record.vat_rate.trim()
              ? Number(record.vat_rate)
              : 25
      } satisfies TemplateOrderLine;
    })
    .filter((item): item is TemplateOrderLine => item !== null);
}

function buildSchema() {
  return z
    .object({
      title: z.string().min(2, 'Titel krävs'),
      status: z.string().min(1, 'Status krävs'),
      templateId: z.string().optional(),
      customerSelect: z.string().optional(),
      newCustomerName: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      orderTotal: z.coerce.number().min(0),
      memberIds: z.array(z.string()).default([])
    })
    .superRefine((value, ctx) => {
      if (value.customerSelect === NEW_CUSTOMER_VALUE && !(value.newCustomerName ?? '').trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ange namn på ny kund',
          path: ['newCustomerName']
        });
      }

      if (value.startDate && value.endDate && value.endDate < value.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Slutdatum kan inte vara tidigare än startdatum',
          path: ['endDate']
        });
      }
    });
}

function ProjectForm({
  onSubmit,
  isPending,
  customers,
  columns,
  initialStatus,
  currentUserId,
  availableMembers,
  templates
}: {
  onSubmit: (data: CreateProjectFormData) => Promise<void>;
  isPending: boolean;
  customers: CustomerItem[];
  columns: ColumnItem[];
  initialStatus: string;
  currentUserId: string;
  availableMembers: ProjectMemberVisual[];
  templates: ProjectTemplate[];
}) {
  const schema = useMemo(() => buildSchema(), []);
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | ProjectMemberVisual['role']>('all');

  const form = useForm<CreateProjectFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      status: initialStatus,
      templateId: NO_TEMPLATE_VALUE,
      customerSelect: '',
      newCustomerName: '',
      startDate: '',
      endDate: '',
      orderTotal: 0,
      responsibleUserId: currentUserId,
      memberIds: []
    }
  });

  const selectedCustomer = form.watch('customerSelect');
  const selectedTemplateId = form.watch('templateId');
  const startDate = form.watch('startDate');
  const responsibleUserId = form.watch('responsibleUserId');
  const selectedMemberIds = form.watch('memberIds');
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );
  const templateMilestonePreview = useMemo(
    () => buildProjectMilestonesFromTemplate(selectedTemplate, startDate),
    [selectedTemplate, startDate]
  );
  const filteredMembers = useMemo(() => {
    if (memberRoleFilter === 'all') return availableMembers;
    return availableMembers.filter((member) => member.role === memberRoleFilter);
  }, [availableMembers, memberRoleFilter]);

  useEffect(() => {
    if (initialStatus && !form.getValues('status')) {
      form.setValue('status', initialStatus);
    }
  }, [form, initialStatus]);

  useEffect(() => {
    if (!selectedTemplate || selectedTemplateId === NO_TEMPLATE_VALUE) return;
    form.setValue('status', selectedTemplate.start_status);
    form.setValue('memberIds', selectedTemplate.member_user_ids ?? []);
  }, [form, selectedTemplate, selectedTemplateId]);

  useEffect(() => {
    if (!form.getValues('responsibleUserId') && currentUserId) {
      form.setValue('responsibleUserId', currentUserId);
    }
  }, [currentUserId, form]);

  return (
    <form
      className="space-y-3"
      onSubmit={form.handleSubmit(async (data) => {
        await onSubmit(data);
        form.reset({
          title: '',
          status: initialStatus,
          templateId: NO_TEMPLATE_VALUE,
          customerSelect: '',
          newCustomerName: '',
          startDate: '',
          endDate: '',
          orderTotal: 0,
          responsibleUserId: currentUserId,
          memberIds: []
        });
      })}
    >
      <div className="space-y-1">
        <p className="text-sm">Projekttitel</p>
        <Input {...form.register('title')} placeholder="Nytt projekt" />
        {form.formState.errors.title && <p className="text-xs text-danger">{form.formState.errors.title.message}</p>}
      </div>

      <div className="space-y-1">
        <p className="text-sm">Projektmall</p>
        <Select value={selectedTemplateId} onValueChange={(value) => form.setValue('templateId', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Ingen mall" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TEMPLATE_VALUE}>Ingen mall</SelectItem>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTemplate?.description ? <p className="text-xs text-foreground/60">{selectedTemplate.description}</p> : null}
      </div>

      <div className="space-y-1">
        <p className="text-sm">Startkolumn</p>
        <Select value={form.watch('status')} onValueChange={(value) => form.setValue('status', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Välj kolumn" />
          </SelectTrigger>
          <SelectContent>
            {columns.map((column) => (
              <SelectItem key={column.key} value={column.key}>
                {column.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <p className="text-sm">Kund</p>
        <Select value={selectedCustomer} onValueChange={(value) => form.setValue('customerSelect', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Välj befintlig eller ny" />
          </SelectTrigger>
          <SelectContent>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
              </SelectItem>
            ))}
            <SelectItem value={NEW_CUSTOMER_VALUE}>+ Ny kund</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedCustomer === NEW_CUSTOMER_VALUE && (
        <div className="space-y-1">
          <p className="text-sm">Namn på ny kund</p>
          <Input {...form.register('newCustomerName')} placeholder="Kundnamn" />
          {form.formState.errors.newCustomerName && (
            <p className="text-xs text-danger">{form.formState.errors.newCustomerName.message}</p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm">Ordertotal (valfritt)</p>
        <Input type="number" {...form.register('orderTotal')} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-sm">Startdatum</p>
          <Input type="date" {...form.register('startDate')} />
        </div>
        <div className="space-y-1">
          <p className="text-sm">Slutdatum</p>
          <Input type="date" {...form.register('endDate')} />
          {form.formState.errors.endDate && <p className="text-xs text-danger">{form.formState.errors.endDate.message}</p>}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm">Ansvarig</p>
        <Select value={responsibleUserId || currentUserId || undefined} onValueChange={(value) => form.setValue('responsibleUserId', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Välj ansvarig" />
          </SelectTrigger>
          <SelectContent>
            {availableMembers.map((member) => (
              <SelectItem key={member.id} value={member.user_id}>
                {getUserDisplayName({
                  displayName: member.display_name,
                  email: member.email,
                  handle: member.handle,
                  userId: member.user_id
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTemplate && (templateMilestonePreview?.length ?? 0) > 0 ? (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Delmål från mall</p>
          <div className="space-y-1">
            {templateMilestonePreview?.map((milestone) => (
              <div key={milestone.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{milestone.title}</span>
                <span className="shrink-0 text-xs text-foreground/60">{milestone.date || 'Sätt startdatum för datum'}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">Tilldela medlemmar</p>
          <div className="flex flex-wrap gap-2">
            {(['all', 'member', 'finance', 'admin', 'auditor'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setMemberRoleFilter(filter)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  memberRoleFilter === filter ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/65'
                }`}
              >
                {filter === 'all' ? 'Alla' : filter}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => form.setValue('memberIds', filteredMembers.map((member) => member.user_id))}
          >
            Markera alla
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue('memberIds', [])}>
            Rensa
          </Button>
        </div>
        <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border p-2">
          {availableMembers.length === 0 ? <p className="text-sm text-foreground/65">Inga medlemmar hittades.</p> : null}
          {filteredMembers.map((member) => {
            const isSelected = selectedMemberIds.includes(member.user_id);
            return (
              <button
                key={member.id}
                type="button"
                className={`flex items-center justify-between gap-3 rounded-lg border p-2 text-left transition ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border'
                }`}
                onClick={() =>
                  form.setValue(
                    'memberIds',
                    isSelected
                      ? selectedMemberIds.filter((id) => id !== member.user_id)
                      : [...selectedMemberIds, member.user_id]
                  )
                }
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProfileBadge
                    label={member.display_name ?? member.email ?? member.user_id}
                    color={member.color}
                    avatarUrl={member.avatar_url}
                    emoji={member.emoji}
                    className="h-8 w-8 shrink-0"
                    textClassName="text-xs font-semibold text-white"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {getUserDisplayName({
                        displayName: member.display_name,
                        email: member.email,
                        handle: member.handle,
                        userId: member.user_id
                      })}
                    </p>
                    <p className="text-xs text-foreground/55">{member.role}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-foreground/70">{isSelected ? 'Vald' : 'Lägg till'}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Button className="w-full" type="submit" disabled={isPending || columns.length === 0}>
        {isPending ? 'Skapar...' : 'Skapa projekt'}
      </Button>
    </form>
  );
}

export default function CreateProjectEntry({ companyId, mode }: { companyId: string; mode: 'mobile' | 'desktop' }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createMutation = useCreateProject(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const projectMembersQuery = useProjectMembers(companyId);
  const companyMemberDirectoryQuery = useCompanyMemberDirectory(companyId);
  const adminMembersQuery = useQuery<Array<{ id: string; user_id: string; role: ProjectMemberVisual['role']; email: string | null; display_name: string | null }>>({
    queryKey: ['admin-members-lite', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/members?companyId=${companyId}`);
      if (!res.ok) return [];
      const body = (await res.json().catch(() => null)) as { members?: Array<{ id: string; user_id: string; role: ProjectMemberVisual['role']; email: string | null; display_name: string | null }> } | null;
      return body?.members ?? [];
    },
    staleTime: 1000 * 60 * 5
  });
  const projectTemplatesQuery = useProjectTemplates(companyId);
  const currentUserQuery = useQuery({
    queryKey: ['current-user-auth-id'],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
        error
      } = await supabase.auth.getUser();

      if (error) throw error;
      return user?.id ?? '';
    },
    staleTime: 1000 * 60 * 10
  });

  const customersQuery = useQuery<CustomerItem[]>({
    queryKey: ['customers', companyId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name');

      if (error) throw error;
      return data ?? [];
    }
  });

  const columns: ColumnItem[] = (columnsQuery.data ?? []).map((c) => ({ key: c.key, title: c.title }));
  const initialStatus = columns[0]?.key ?? '';
  const availableMembers = useMemo(() => {
    const visualsByUserId = new Map(
      (projectMembersQuery.data?.availableMembers ?? []).map((member) => [member.user_id, member] as const)
    );
    const baseMembers = new Map<string, { id: string; company_id: string; user_id: string; role: ProjectMemberVisual['role']; created_at: string; email: string | null; handle: string | null; display_name: string | null }>();

    for (const member of companyMemberDirectoryQuery.data ?? []) {
      baseMembers.set(member.user_id, member);
    }
    for (const member of adminMembersQuery.data ?? []) {
      if (!baseMembers.has(member.user_id)) {
        baseMembers.set(member.user_id, {
          ...member,
          company_id: companyId,
          created_at: '',
          handle: member.email?.split('@')[0]?.toLowerCase() ?? null
        });
      }
    }

    return Array.from(baseMembers.values()).map((member) => {
      const visual = visualsByUserId.get(member.user_id);
      return {
        ...member,
        color: visual?.color ?? '#3b82f6',
        avatar_path: visual?.avatar_path ?? null,
        avatar_url: visual?.avatar_url ?? null,
        emoji: visual?.emoji ?? null
      };
    });
  }, [adminMembersQuery.data, companyId, companyMemberDirectoryQuery.data, projectMembersQuery.data?.availableMembers]);

  useEffect(() => {
    if (pathname !== '/projects') return;
    if (searchParams.get('create') === 'project') {
      setOpen(true);
    }
  }, [pathname, searchParams]);

  function updateCreateParam(nextOpen: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextOpen) {
      params.set('create', 'project');
    } else {
      params.delete('create');
    }

    const query = params.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
  }

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    updateCreateParam(nextOpen);
  }

  async function submit(data: CreateProjectFormData) {
    const customerId = data.customerSelect && data.customerSelect !== NEW_CUSTOMER_VALUE ? data.customerSelect : null;
    const customerName = data.customerSelect === NEW_CUSTOMER_VALUE ? data.newCustomerName?.trim() ?? '' : null;
    const template = (projectTemplatesQuery.data ?? []).find((item) => item.id === data.templateId) ?? null;
    const responsibleUserId = data.responsibleUserId?.trim() || currentUserQuery.data || null;
    const memberIds = responsibleUserId
      ? Array.from(new Set([...(data.memberIds ?? []), responsibleUserId]))
      : data.memberIds;

    await createMutation.mutateAsync({
      title: data.title,
      status: data.status,
      customer_id: customerId,
      customer_name: customerName,
      start_date: data.startDate?.trim() ? data.startDate : null,
      end_date: data.endDate?.trim() ? data.endDate : null,
      order_total: data.orderTotal,
      responsible_user_id: responsibleUserId,
      member_ids: memberIds,
      milestones: buildProjectMilestonesFromTemplate(template, data.startDate),
      task_templates: buildProjectTasksFromTemplate(template),
      order_line_templates: buildOrderLinesFromTemplate(template),
      source: 'ui'
    });

    setDialogOpen(false);
  }

  const customers = customersQuery.data ?? [];
  const currentUserId = currentUserQuery.data ?? '';

  if (mode === 'mobile') {
    return (
      <Card>
        <CardContent className="p-3">
          <Button className="w-full" onClick={() => setDialogOpen(true)}>
            Nytt projekt
          </Button>
          <ActionSheet open={open} onClose={() => setDialogOpen(false)} title="Snabbskapa projekt" description="Funkar online och offline">
            <div className="max-h-[72vh] overflow-y-auto pr-1">
              <ProjectForm
                onSubmit={submit}
                isPending={createMutation.isPending}
                customers={customers}
                columns={columns}
                initialStatus={initialStatus}
                currentUserId={currentUserId}
                availableMembers={availableMembers}
                templates={projectTemplatesQuery.data ?? []}
              />
            </div>
          </ActionSheet>
        </CardContent>
      </Card>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button>Nytt projekt</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Skapa projekt</DialogTitle>
          <DialogDescription>Skapar projekt och orderutkast via RPC.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(85vh-6rem)] overflow-y-auto pr-1">
          <ProjectForm
            onSubmit={submit}
            isPending={createMutation.isPending}
            customers={customers}
            columns={columns}
            initialStatus={initialStatus}
            currentUserId={currentUserId}
            availableMembers={availableMembers}
            templates={projectTemplatesQuery.data ?? []}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
