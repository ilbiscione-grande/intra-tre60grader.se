'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ProfileBadge from '@/components/common/ProfileBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProjectColumns, useProjectMembers, useProjectTemplates, type ProjectMemberVisual, type ProjectTemplate } from '@/features/projects/projectQueries';
import { createClient } from '@/lib/supabase/client';

type TemplateMilestoneDraft = {
  id: string;
  title: string;
  offset_days: string;
};

type TemplateTaskDraft = {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high';
  assignee_user_id: string;
  milestone_id: string;
  offset_days: string;
  subtasks: Array<{ id: string; title: string; done: boolean }>;
};

type TemplateOrderLineDraft = {
  id: string;
  title: string;
  qty: string;
  unit_price: string;
  vat_rate: string;
};

type TemplateDraft = {
  id?: string;
  name: string;
  description: string;
  start_status: string;
  member_user_ids: string[];
  milestones: TemplateMilestoneDraft[];
  task_templates: TemplateTaskDraft[];
  order_line_templates: TemplateOrderLineDraft[];
};

const EMPTY_TEMPLATE: TemplateDraft = {
  name: '',
  description: '',
  start_status: '',
  member_user_ids: [],
  milestones: [],
  task_templates: [],
  order_line_templates: []
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function mapTemplateMilestones(value: ProjectTemplate['milestones']): TemplateMilestoneDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title.trim() : '';
      const offsetDays =
        typeof record.offset_days === 'number'
          ? String(record.offset_days)
          : typeof record.offset_days === 'string'
            ? record.offset_days
            : '';
      if (!title) return null;
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id : `milestone-${index}`,
        title,
        offset_days: offsetDays
      };
    })
    .filter((item): item is TemplateMilestoneDraft => Boolean(item));
}

function createDraftFromTemplate(template: ProjectTemplate | null, fallbackStatus: string): TemplateDraft {
  if (!template) {
    return {
      ...EMPTY_TEMPLATE,
      start_status: fallbackStatus
    };
  }

  return {
    id: template.id,
    name: template.name,
    description: template.description ?? '',
    start_status: template.start_status || fallbackStatus,
    member_user_ids: template.member_user_ids ?? [],
    milestones: mapTemplateMilestones(template.milestones),
    task_templates: Array.isArray(template.task_templates)
      ? template.task_templates
          .map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const record = item as Record<string, unknown>;
            const title = typeof record.title === 'string' ? record.title.trim() : '';
            if (!title) return null;
            return {
              id: typeof record.id === 'string' && record.id.trim() ? record.id : `task-${index}`,
              title,
              description: typeof record.description === 'string' ? record.description : '',
              priority:
                record.priority === 'low' || record.priority === 'high' || record.priority === 'normal'
                  ? record.priority
                  : 'normal',
              assignee_user_id: typeof record.assignee_user_id === 'string' ? record.assignee_user_id : 'none',
              milestone_id: typeof record.milestone_id === 'string' ? record.milestone_id : 'none',
              offset_days:
                typeof record.offset_days === 'number'
                  ? String(record.offset_days)
                  : typeof record.offset_days === 'string'
                    ? record.offset_days
                    : '',
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
            } satisfies TemplateTaskDraft;
          })
          .filter((item): item is TemplateTaskDraft => item !== null)
      : [],
    order_line_templates: Array.isArray(template.order_line_templates)
      ? template.order_line_templates
          .map((item, index) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
            const record = item as Record<string, unknown>;
            const title = typeof record.title === 'string' ? record.title.trim() : '';
            if (!title) return null;
            return {
              id: typeof record.id === 'string' && record.id.trim() ? record.id : `line-${index}`,
              title,
              qty:
                typeof record.qty === 'number' ? String(record.qty) : typeof record.qty === 'string' ? record.qty : '1',
              unit_price:
                typeof record.unit_price === 'number'
                  ? String(record.unit_price)
                  : typeof record.unit_price === 'string'
                    ? record.unit_price
                    : '0',
              vat_rate:
                typeof record.vat_rate === 'number'
                  ? String(record.vat_rate)
                  : typeof record.vat_rate === 'string'
                    ? record.vat_rate
                    : '25'
            } satisfies TemplateOrderLineDraft;
          })
          .filter((item): item is TemplateOrderLineDraft => item !== null)
      : []
  };
}

function newMilestoneDraft(): TemplateMilestoneDraft {
  return {
    id: `milestone-${crypto.randomUUID()}`,
    title: '',
    offset_days: ''
  };
}

function newTaskDraft(): TemplateTaskDraft {
  return {
    id: `task-${crypto.randomUUID()}`,
    title: '',
    description: '',
    priority: 'normal',
    assignee_user_id: 'none',
    milestone_id: 'none',
    offset_days: '',
    subtasks: []
  };
}

function newOrderLineDraft(): TemplateOrderLineDraft {
  return {
    id: `line-${crypto.randomUUID()}`,
    title: '',
    qty: '1',
    unit_price: '0',
    vat_rate: '25'
  };
}

export default function ProjectTemplatesCard({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [memberFilter, setMemberFilter] = useState<'all' | ProjectMemberVisual['role']>('all');
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const templatesQuery = useProjectTemplates(companyId);
  const columnsQuery = useProjectColumns(companyId);
  const projectMembersQuery = useProjectMembers(companyId);
  const columns = columnsQuery.data ?? [];
  const availableMembers = projectMembersQuery.data?.availableMembers ?? [];
  const filteredMembers = useMemo(() => {
    if (memberFilter === 'all') return availableMembers;
    return availableMembers.filter((member) => member.role === memberFilter);
  }, [availableMembers, memberFilter]);

  useEffect(() => {
    if (!draft.start_status && columns[0]?.key) {
      setDraft((current) => ({ ...current, start_status: columns[0]?.key ?? '' }));
    }
  }, [columns, draft.start_status]);

  const saveMutation = useMutation({
    mutationFn: async (payload: TemplateDraft) => {
      const normalizedName = payload.name.trim();
      if (!normalizedName) throw new Error('Mallnamn krävs');

      const record = {
        id: payload.id,
        company_id: companyId,
        name: normalizedName,
        description: payload.description.trim() || null,
        start_status: payload.start_status,
        member_user_ids: payload.member_user_ids,
        milestones: payload.milestones
          .filter((item) => item.title.trim())
          .map((item) => ({
            id: item.id,
            title: item.title.trim(),
            offset_days: item.offset_days.trim() === '' ? null : Number(item.offset_days)
          })),
        task_templates: payload.task_templates
          .filter((task) => task.title.trim())
          .map((task) => ({
            id: task.id,
            title: task.title.trim(),
            description: task.description.trim() || null,
            priority: task.priority,
            assignee_user_id: task.assignee_user_id === 'none' ? null : task.assignee_user_id,
            milestone_id: task.milestone_id === 'none' ? null : task.milestone_id,
            offset_days: task.offset_days.trim() === '' ? null : Number(task.offset_days),
            subtasks: task.subtasks.filter((subtask) => subtask.title.trim()).map((subtask) => ({
              id: subtask.id,
              title: subtask.title.trim(),
              done: Boolean(subtask.done)
            }))
          })),
        order_line_templates: payload.order_line_templates
          .filter((line) => line.title.trim())
          .map((line) => ({
            id: line.id,
            title: line.title.trim(),
            qty: Number(line.qty || 1),
            unit_price: Number(line.unit_price || 0),
            vat_rate: Number(line.vat_rate || 25)
          }))
      };

      const { error } = await supabase.from('project_templates').upsert(record, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-templates', companyId] });
      toast.success('Projektmall sparad');
      setOpen(false);
      setDraft(createDraftFromTemplate(null, columns[0]?.key ?? ''));
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte spara projektmall'));
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.from('project_templates').delete().eq('company_id', companyId).eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['project-templates', companyId] });
      toast.success('Projektmall borttagen');
    },
    onError: (error) => {
      toast.error(toErrorMessage(error, 'Kunde inte ta bort projektmall'));
    }
  });

  function openCreate() {
    setDraft(createDraftFromTemplate(null, columns[0]?.key ?? ''));
    setOpen(true);
  }

  function openEdit(template: ProjectTemplate) {
    setDraft(createDraftFromTemplate(template, columns[0]?.key ?? ''));
    setOpen(true);
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Projektmallar</CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Ny mall
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Mallar fyller i startkolumn, standardmedlemmar och delmål när ett nytt projekt skapas.</p>
          {(templatesQuery.data ?? []).length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-foreground/70">Inga projektmallar skapade ännu.</p>
          ) : (
            <div className="space-y-2">
              {(templatesQuery.data ?? []).map((template) => (
                <div key={template.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{template.name}</p>
                      {template.description ? <p className="mt-1 text-sm text-foreground/65">{template.description}</p> : null}
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-foreground/65">
                        <span className="rounded-full bg-muted px-2 py-1">Kolumn: {columns.find((column) => column.key === template.start_status)?.title ?? template.start_status}</span>
                        <span className="rounded-full bg-muted px-2 py-1">Delmål: {mapTemplateMilestones(template.milestones).length}</span>
                        <span className="rounded-full bg-muted px-2 py-1">Medlemmar: {template.member_user_ids.length}</span>
                        <span className="rounded-full bg-muted px-2 py-1">Uppgifter: {Array.isArray(template.task_templates) ? template.task_templates.length : 0}</span>
                        <span className="rounded-full bg-muted px-2 py-1">Orderrader: {Array.isArray(template.order_line_templates) ? template.order_line_templates.length : 0}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(template)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Redigera projektmall' : 'Ny projektmall'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <label className="space-y-1 block">
              <span className="text-sm">Mallnamn</span>
              <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>

            <label className="space-y-1 block">
              <span className="text-sm">Beskrivning</span>
              <Textarea
                className="min-h-[88px]"
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </label>

            <div className="space-y-1">
              <span className="text-sm">Startkolumn</span>
              <Select value={draft.start_status} onValueChange={(value) => setDraft((current) => ({ ...current, start_status: value }))}>
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

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Standardmedlemmar</p>
                <div className="flex flex-wrap gap-2">
                  {(['all', 'member', 'finance', 'admin', 'auditor'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setMemberFilter(filter)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        memberFilter === filter ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-foreground/65'
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
                  onClick={() => setDraft((current) => ({ ...current, member_user_ids: filteredMembers.map((member) => member.user_id) }))}
                >
                  Markera alla
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((current) => ({ ...current, member_user_ids: [] }))}>
                  Rensa
                </Button>
              </div>

              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border p-2">
                {filteredMembers.map((member) => {
                  const isSelected = draft.member_user_ids.includes(member.user_id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={`flex items-center justify-between gap-3 rounded-lg border p-2 text-left transition ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          member_user_ids: isSelected
                            ? current.member_user_ids.filter((id) => id !== member.user_id)
                            : [...current.member_user_ids, member.user_id]
                        }))
                      }
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ProfileBadge
                          label={member.email ?? member.user_id}
                          color={member.color}
                          avatarUrl={member.avatar_url}
                          emoji={member.emoji}
                          className="h-8 w-8 shrink-0"
                          textClassName="text-xs font-semibold text-white"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{member.email ?? member.user_id}</p>
                          <p className="text-xs text-foreground/55">{member.role}</p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-foreground/70">{isSelected ? 'Vald' : 'Lägg till'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Standarddelmål</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft((current) => ({ ...current, milestones: [...current.milestones, newMilestoneDraft()] }))}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Lägg till delmål
                </Button>
              </div>
              <div className="space-y-2">
                {draft.milestones.length === 0 ? (
                  <p className="rounded-lg bg-muted p-3 text-sm text-foreground/70">Mallen har inga delmål ännu.</p>
                ) : (
                  draft.milestones.map((milestone) => (
                    <div key={milestone.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr,180px,auto]">
                      <Input
                        placeholder="Titel"
                        value={milestone.title}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            milestones: current.milestones.map((item) =>
                              item.id === milestone.id ? { ...item, title: event.target.value } : item
                            )
                          }))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Dagar från start"
                        value={milestone.offset_days}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            milestones: current.milestones.map((item) =>
                              item.id === milestone.id ? { ...item, offset_days: event.target.value } : item
                            )
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            milestones: current.milestones.filter((item) => item.id !== milestone.id)
                          }))
                        }
                      >
                        Ta bort
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Standarduppgifter</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft((current) => ({ ...current, task_templates: [...current.task_templates, newTaskDraft()] }))}>
                  <Plus className="mr-2 h-4 w-4" />
                  Lägg till uppgift
                </Button>
              </div>
              <div className="space-y-3">
                {draft.task_templates.length === 0 ? (
                  <p className="rounded-lg bg-muted p-3 text-sm text-foreground/70">Mallen har inga standarduppgifter ännu.</p>
                ) : (
                  draft.task_templates.map((task) => (
                    <div key={task.id} className="space-y-3 rounded-xl border p-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input
                          placeholder="Titel"
                          value={task.title}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              task_templates: current.task_templates.map((item) => item.id === task.id ? { ...item, title: event.target.value } : item)
                            }))
                          }
                        />
                        <Input
                          type="number"
                          placeholder="Dagar från start"
                          value={task.offset_days}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              task_templates: current.task_templates.map((item) => item.id === task.id ? { ...item, offset_days: event.target.value } : item)
                            }))
                          }
                        />
                      </div>
                      <Textarea
                        className="min-h-[72px]"
                        placeholder="Beskrivning"
                        value={task.description}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            task_templates: current.task_templates.map((item) => item.id === task.id ? { ...item, description: event.target.value } : item)
                          }))
                        }
                      />
                      <div className="grid gap-2 md:grid-cols-3">
                        <Select
                          value={task.priority}
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              task_templates: current.task_templates.map((item) =>
                                item.id === task.id ? { ...item, priority: value as 'low' | 'normal' | 'high' } : item
                              )
                            }))
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Låg</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">Hög</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={task.assignee_user_id}
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              task_templates: current.task_templates.map((item) => item.id === task.id ? { ...item, assignee_user_id: value } : item)
                            }))
                          }
                        >
                          <SelectTrigger><SelectValue placeholder="Ansvarig" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Ingen ansvarig</SelectItem>
                            {availableMembers.map((member) => (
                              <SelectItem key={member.user_id} value={member.user_id}>{member.email ?? member.user_id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={task.milestone_id}
                          onValueChange={(value) =>
                            setDraft((current) => ({
                              ...current,
                              task_templates: current.task_templates.map((item) => item.id === task.id ? { ...item, milestone_id: value } : item)
                            }))
                          }
                        >
                          <SelectTrigger><SelectValue placeholder="Delmål" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Inget delmål</SelectItem>
                            {draft.milestones.filter((milestone) => milestone.title.trim()).map((milestone) => (
                              <SelectItem key={milestone.id} value={milestone.id}>{milestone.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-foreground/65">Checklista</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setDraft((current) => ({
                                ...current,
                                task_templates: current.task_templates.map((item) =>
                                  item.id === task.id
                                    ? {
                                        ...item,
                                        subtasks: [...item.subtasks, { id: `subtask-${crypto.randomUUID()}`, title: '', done: false }]
                                      }
                                    : item
                                )
                              }))
                            }
                          >
                            Lägg till delsteg
                          </Button>
                        </div>
                        {task.subtasks.map((subtask) => (
                          <div key={subtask.id} className="flex gap-2">
                            <Input
                              placeholder="Delsteg"
                              value={subtask.title}
                              onChange={(event) =>
                                setDraft((current) => ({
                                  ...current,
                                  task_templates: current.task_templates.map((item) =>
                                    item.id === task.id
                                      ? {
                                          ...item,
                                          subtasks: item.subtasks.map((child) =>
                                            child.id === subtask.id ? { ...child, title: event.target.value } : child
                                          )
                                        }
                                      : item
                                  )
                                }))
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() =>
                                setDraft((current) => ({
                                  ...current,
                                  task_templates: current.task_templates.map((item) =>
                                    item.id === task.id
                                      ? { ...item, subtasks: item.subtasks.filter((child) => child.id !== subtask.id) }
                                      : item
                                  )
                                }))
                              }
                            >
                              Ta bort
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              task_templates: current.task_templates.filter((item) => item.id !== task.id)
                            }))
                          }
                        >
                          Ta bort uppgift
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Standardorderrader</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setDraft((current) => ({ ...current, order_line_templates: [...current.order_line_templates, newOrderLineDraft()] }))}>
                  <Plus className="mr-2 h-4 w-4" />
                  Lägg till orderrad
                </Button>
              </div>
              <div className="space-y-2">
                {draft.order_line_templates.length === 0 ? (
                  <p className="rounded-lg bg-muted p-3 text-sm text-foreground/70">Mallen har inga standardorderrader ännu.</p>
                ) : (
                  draft.order_line_templates.map((line) => (
                    <div key={line.id} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr,90px,120px,90px,auto]">
                      <Input
                        placeholder="Titel"
                        value={line.title}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            order_line_templates: current.order_line_templates.map((item) => item.id === line.id ? { ...item, title: event.target.value } : item)
                          }))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Antal"
                        value={line.qty}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            order_line_templates: current.order_line_templates.map((item) => item.id === line.id ? { ...item, qty: event.target.value } : item)
                          }))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="A-pris"
                        value={line.unit_price}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            order_line_templates: current.order_line_templates.map((item) => item.id === line.id ? { ...item, unit_price: event.target.value } : item)
                          }))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Moms %"
                        value={line.vat_rate}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            order_line_templates: current.order_line_templates.map((item) => item.id === line.id ? { ...item, vat_rate: event.target.value } : item)
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            order_line_templates: current.order_line_templates.filter((item) => item.id !== line.id)
                          }))
                        }
                      >
                        Ta bort
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Avbryt
              </Button>
              <Button type="button" onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending || columns.length === 0}>
                {saveMutation.isPending ? 'Sparar...' : 'Spara mall'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
