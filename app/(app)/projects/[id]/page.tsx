'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowUpRight, CalendarDays, CircleDollarSign, FolderKanban, ReceiptText, Users } from 'lucide-react';
import { toast } from 'sonner';
import ProfileBadge from '@/components/common/ProfileBadge';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createInvoiceFromOrder } from '@/lib/rpc';
import { useCompanyMemberOptions, useProjectColumns, type ProjectMemberVisual } from '@/features/projects/projectQueries';
import { applyProjectStatusAutomation } from '@/features/projects/projectAutomation';
import ProjectFinancePanel from '@/features/projects/ProjectFinancePanel';
import ProjectFilesPanel from '@/features/projects/ProjectFilesPanel';
import ProjectTasksPanel from '@/features/projects/ProjectTasksPanel';
import ProjectTimePanel from '@/features/projects/ProjectTimePanel';
import ProjectUpdatesPanel from '@/features/projects/ProjectUpdatesPanel';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import { createClient } from '@/lib/supabase/client';
import type { Json, TableRow as DbRow } from '@/lib/supabase/database.types';
import type { ProjectStatus, Role } from '@/lib/types';
import { useAutoScrollActiveTab } from '@/lib/ui/useAutoScrollActiveTab';
import { useSwipeTabs } from '@/lib/ui/useSwipeTabs';

type ProjectRow = Pick<
  DbRow<'projects'>,
  'id' | 'company_id' | 'title' | 'status' | 'workflow_status' | 'position' | 'customer_id' | 'start_date' | 'end_date' | 'milestones' | 'responsible_user_id' | 'created_at' | 'updated_at'
>;

type CustomerRow = Pick<DbRow<'customers'>, 'id' | 'name'>;
type OrderRow = Pick<DbRow<'orders'>, 'id' | 'project_id' | 'status' | 'total' | 'created_at'>;
type OrderLineRow = Pick<DbRow<'order_lines'>, 'id' | 'title' | 'qty' | 'unit_price' | 'vat_rate' | 'total' | 'created_at'>;
type InvoiceSourceLinkRow = Pick<DbRow<'invoice_sources'>, 'invoice_id' | 'project_id' | 'order_id' | 'position'>;
type InvoiceSourceCountRow = Pick<DbRow<'invoice_sources'>, 'invoice_id'>;
type ProjectUpdateActivityRow = Pick<DbRow<'project_updates'>, 'id' | 'project_id' | 'created_by' | 'created_at' | 'parent_id'>;
type ProjectTaskActivityRow = Pick<DbRow<'project_tasks'>, 'id' | 'project_id' | 'title' | 'created_by' | 'assignee_user_id' | 'created_at' | 'updated_at'>;
type ProjectTimeActivityRow = Pick<DbRow<'project_time_entries'>, 'id' | 'project_id' | 'user_id' | 'hours' | 'entry_date' | 'created_at'>;
type ProjectFileActivityRow = Pick<DbRow<'project_files'>, 'id' | 'project_id' | 'created_by' | 'created_at' | 'file_name' | 'title' | 'version_no'>;
type ProjectMemberAssignmentRow = Pick<DbRow<'project_members'>, 'id' | 'company_id' | 'project_id' | 'user_id' | 'created_by' | 'created_at'>;
type InvoiceRow = Pick<
  DbRow<'invoices'>,
  'id' | 'invoice_no' | 'status' | 'currency' | 'issue_date' | 'due_date' | 'subtotal' | 'vat_total' | 'total' | 'created_at' | 'attachment_path' | 'order_id' | 'project_id'
>;
type ActivityItem = {
  actorUserId?: string | null;
  id: string;
  at: string;
  text: string;
  source: 'system' | 'user';
};
type ProjectTab = 'overview' | 'planning' | 'tasks' | 'time' | 'updates' | 'economy' | 'attachments' | 'members' | 'logs';
type ProjectMilestone = {
  id: string;
  title: string;
  date: string;
  completed: boolean;
};

const orderStatuses = ['draft', 'sent', 'paid', 'cancelled', 'invoiced'] as const;
type OrderStatus = (typeof orderStatuses)[number];
const projectTabs: Array<{ id: ProjectTab; label: string }> = [
  { id: 'overview', label: 'Översikt' },
  { id: 'planning', label: 'Tidsplan' },
  { id: 'tasks', label: 'Uppgifter' },
  { id: 'time', label: 'Tid' },
  { id: 'updates', label: 'Uppdateringar' },
  { id: 'economy', label: 'Ekonomi' },
  { id: 'attachments', label: 'Bilagor' },
  { id: 'members', label: 'Medlemmar' },
  { id: 'logs', label: 'Loggar' }
];

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeLineTotal(qty: number, unitPrice: number) {
  return Math.round(qty * unitPrice * 100) / 100;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

function extractInvoiceSummary(result: unknown) {
  if (!result || typeof result !== 'object') return 'Faktura skapad';

  const record = result as Record<string, unknown>;
  const invoiceNo = record.invoice_no ?? record.invoiceNo ?? record.number;
  const invoiceId = record.invoice_id ?? record.invoiceId ?? record.id;

  if (typeof invoiceNo === 'string' && invoiceNo.trim()) return `Faktura skapad: ${invoiceNo}`;
  if (typeof invoiceId === 'string' && invoiceId.trim()) return `Faktura skapad (id: ${invoiceId})`;
  return 'Faktura skapad';
}

function orderStatusEtikett(status: string) {
  const map: Record<string, string> = {
    draft: 'Utkast',
    sent: 'Skickad',
    paid: 'Betald',
    cancelled: 'Avbruten',
    invoiced: 'Fakturerad'
  };
  return map[status] ?? status;
}

function fakturaStatusEtikett(status: string) {
  const map: Record<string, string> = {
    issued: 'Utfärdad',
    sent: 'Skickad',
    paid: 'Betald',
    void: 'Makulerad'
  };
  return map[status] ?? status;
}

function canManageOrder(role: Role) {
  return role === 'finance' || role === 'admin';
}

function roleLabel(role: Role) {
  const map: Record<Role, string> = {
    member: 'Medlem',
    finance: 'Ekonomi',
    admin: 'Admin',
    auditor: 'Revisor'
  };
  return map[role];
}

function projectColumnTitle(status: string, columns: Array<{ key: string; title: string }>) {
  return columns.find((column) => column.key === status)?.title ?? status;
}

function normalizeProjectMilestones(value: Json | null | undefined): ProjectMilestone[] {
  if (!Array.isArray(value)) return [];

  return sortProjectMilestones(
    value
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
    .filter((item): item is ProjectMilestone => Boolean(item))
  );
}

function sortProjectMilestones(milestones: ProjectMilestone[]) {
  return [...milestones].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.date && !b.date) return a.title.localeCompare(b.title, 'sv');
    if (!a.date) return 1;
    if (!b.date) return -1;
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.title.localeCompare(b.title, 'sv');
  });
}

function serializeProjectMilestones(milestones: ProjectMilestone[]): Json {
  return sortProjectMilestones(milestones)
    .map((milestone) => ({
      id: milestone.id,
      title: milestone.title.trim(),
      date: milestone.date,
      completed: Boolean(milestone.completed)
    }))
    .filter((milestone) => milestone.title || milestone.date);
}

function formatProjectDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('sv-SE') : 'Ej satt';
}

function todayIsoDate() {
  return new Date().toLocaleDateString('sv-CA');
}

function normalizeUserIdList(userIds: Iterable<string>) {
  return Array.from(new Set(userIds)).sort((a, b) => a.localeCompare(b));
}

function sameUserIdList(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function ProjectSummaryCard({
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
    <div className="rounded-2xl border border-border/70 bg-muted/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
          <p className="text-base font-semibold leading-snug text-foreground">{value}</p>
          <p className="text-sm text-foreground/65">{helper}</p>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

export default function ProjectDetailsPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const { companyId, role } = useAppContext();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftStatus, setDraftStatus] = useState<ProjectStatus>('');
  const [draftWorkflowStatus, setDraftWorkflowStatus] = useState<ProjectStatus>('');
  const [draftCustomerId, setDraftCustomerId] = useState<string>('none');
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');
  const [draftMilestones, setDraftMilestones] = useState<ProjectMilestone[]>([]);

  const [lineTitle, setLineTitle] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineUnitPrice, setLineUnitPrice] = useState('0');
  const [lineVatRate, setLineVatRate] = useState('25');

  const [latestInvoiceResult, setLatestInvoiceResult] = useState<Json | null>(null);
  const [localActivity, setLocalActivity] = useState<ActivityItem[]>([]);
  const isProduction = process.env.NODE_ENV === 'production';

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [pendingOrderStatus, setPendingOrderStatus] = useState<OrderStatus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderLineRow | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectTab>('overview');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | Role>('all');
  const [optimisticAssignedUserIds, setOptimisticAssignedUserIds] = useState<string[] | null>(null);
  const hasAutoOpenedPlanningRef = useRef(false);
  const lastSubmittedAssignedUserIdsRef = useRef<string[] | null>(null);
  const swipeHandlers = useSwipeTabs({
    tabs: projectTabs.map((tab) => tab.id),
    activeTab,
    onChange: setActiveTab
  });
  const { containerRef, registerItem } = useAutoScrollActiveTab(activeTab);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab && projectTabs.some((tab) => tab.id === requestedTab)) {
      setActiveTab(requestedTab as ProjectTab);
    }
  }, [searchParams]);

  function addLocalActivity(text: string) {
    setLocalActivity((prev) => [
      { id: crypto.randomUUID(), at: new Date().toISOString(), text, source: 'user' },
      ...prev
    ]);
  }

  const projectQuery = useQuery<ProjectRow | null>({
    queryKey: ['project', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,company_id,title,status,workflow_status,position,customer_id,start_date,end_date,milestones,responsible_user_id,created_at,updated_at')
        .eq('company_id', companyId)
        .eq('id', projectId)
        .maybeSingle<ProjectRow>();

      if (error) throw error;
      return data;
    }
  });

  const columnsQuery = useProjectColumns(companyId);

  const customersQuery = useQuery<CustomerRow[]>({
    queryKey: ['customers', companyId, 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name')
        .returns<CustomerRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const orderQuery = useQuery<OrderRow | null>({
    queryKey: ['project-order', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,project_id,status,total,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .maybeSingle<OrderRow>();

      if (error) throw error;
      return data;
    }
  });

  const orderId = orderQuery.data?.id;
  const statusColumns = columnsQuery.data ?? [];

  const economyLockQuery = useQuery<boolean>({
    queryKey: ['project-finance-locked', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_project_finance_locked', {
        p_company_id: companyId,
        p_project_id: projectId
      });

      if (error) throw error;
      return Boolean(data);
    }
  });
  const currentUserQuery = useQuery({
    queryKey: ['current-user-identity'],
    queryFn: async () => {
      const {
        data: { user },
        error
      } = await supabase.auth.getUser();
      if (error) throw error;
      return {
        id: user?.id ?? '',
        email: user?.email ?? null
      };
    },
    staleTime: 1000 * 60 * 10
  });

  const linesQuery = useQuery<OrderLineRow[]>({
    queryKey: ['project-order-lines', companyId, projectId, orderId ?? 'none'],
    enabled: Boolean(orderId),
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from('order_lines')
        .select('id,title,qty,unit_price,vat_rate,total,created_at')
        .eq('company_id', companyId)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
        .returns<OrderLineRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const invoiceSourceLinksQuery = useQuery<InvoiceSourceLinkRow[]>({
    queryKey: ['project-invoice-source-links', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_sources')
        .select('invoice_id,project_id,order_id,position')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('position', { ascending: true })
        .returns<InvoiceSourceLinkRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const invoicesQuery = useQuery<InvoiceRow[]>({
    queryKey: ['invoices', companyId, projectId, (invoiceSourceLinksQuery.data ?? []).map((row) => row.invoice_id).join(',')],
    queryFn: async () => {
      const invoiceIds = (invoiceSourceLinksQuery.data ?? []).map((row) => row.invoice_id);
      let query = supabase
        .from('invoices')
        .select('id,invoice_no,status,currency,issue_date,due_date,subtotal,vat_total,total,created_at,attachment_path,order_id,project_id')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(25);

      if (invoiceIds.length > 0) {
        query = query.in('id', invoiceIds);
      } else {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query.returns<InvoiceRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const invoiceSourceCountsQuery = useQuery<InvoiceSourceCountRow[]>({
    queryKey: ['project-invoice-source-counts', companyId, (invoicesQuery.data ?? []).map((row) => row.id).join(',')],
    enabled: (invoicesQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const invoiceIds = (invoicesQuery.data ?? []).map((row) => row.id);
      if (invoiceIds.length === 0) return [];

      const { data, error } = await supabase
        .from('invoice_sources')
        .select('invoice_id')
        .eq('company_id', companyId)
        .in('invoice_id', invoiceIds)
        .returns<InvoiceSourceCountRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const companyMemberOptionsQuery = useCompanyMemberOptions(companyId);
  const projectMemberAssignmentsQuery = useQuery<ProjectMemberAssignmentRow[]>({
    queryKey: ['project-member-assignments', companyId, projectId],
    queryFn: async () => {
      const res = await fetch(
        `/api/project-members?companyId=${encodeURIComponent(companyId)}&projectId=${encodeURIComponent(projectId)}`
      );
      const body = (await res.json().catch(() => null)) as
        | { error?: string; assignments?: Array<ProjectMemberAssignmentRow & { member?: ProjectMemberVisual | null }> }
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? 'Kunde inte läsa projektmedlemmar');
      }
      return (body?.assignments ?? []).map((assignment) => ({
        id: assignment.id,
        company_id: assignment.company_id,
        project_id: assignment.project_id,
        user_id: assignment.user_id,
        created_by: assignment.created_by,
        created_at: assignment.created_at
      }));
    }
  });
  const projectUpdatesActivityQuery = useQuery<ProjectUpdateActivityRow[]>({
    queryKey: ['project-updates-activity', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_updates')
        .select('id,project_id,created_by,created_at,parent_id')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .returns<ProjectUpdateActivityRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const projectTasksActivityQuery = useQuery<ProjectTaskActivityRow[]>({
    queryKey: ['project-task-activity', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_tasks')
        .select('id,project_id,title,created_by,assignee_user_id,created_at,updated_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .returns<ProjectTaskActivityRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const projectTimeActivityQuery = useQuery<ProjectTimeActivityRow[]>({
    queryKey: ['project-time-activity', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_time_entries')
        .select('id,project_id,user_id,hours,entry_date,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .returns<ProjectTimeActivityRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const projectFilesActivityQuery = useQuery<ProjectFileActivityRow[]>({
    queryKey: ['project-files-activity', companyId, projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_files')
        .select('id,project_id,created_by,created_at,file_name,title,version_no')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .returns<ProjectFileActivityRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  useEffect(() => {
    if (!projectQuery.data) return;
    setDraftTitle(projectQuery.data.title);
    setDraftStatus(projectQuery.data.status as ProjectStatus);
    setDraftWorkflowStatus((projectQuery.data.workflow_status ?? projectQuery.data.status) as ProjectStatus);
    setDraftCustomerId(projectQuery.data.customer_id ?? 'none');
    setDraftStartDate(projectQuery.data.start_date ?? '');
    setDraftEndDate(projectQuery.data.end_date ?? '');
    setDraftMilestones(normalizeProjectMilestones(projectQuery.data.milestones));
  }, [projectQuery.data?.customer_id, projectQuery.data?.end_date, projectQuery.data?.milestones, projectQuery.data?.start_date, projectQuery.data?.status, projectQuery.data?.title, projectQuery.data?.workflow_status]);

  useEffect(() => {
    if (!draftStatus && statusColumns.length > 0) {
      setDraftStatus(statusColumns[0].key);
    }
  }, [draftStatus, statusColumns]);

  async function ensureOrderId() {
    if (orderQuery.data?.id) return orderQuery.data.id;

    const { data, error } = await supabase
      .from('orders')
      .insert({ company_id: companyId, project_id: projectId, status: 'draft', total: 0 })
      .select('id,project_id,status,total,created_at')
      .single<OrderRow>();

    if (error) throw error;
    if (!data?.id) throw new Error('Kunde inte skapa order');

    await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
    addLocalActivity('Order skapad');
    return data.id;
  }

  async function recalcOrderTotal(nextOrderId: string) {
    const { data: rows, error: rowsError } = await supabase
      .from('order_lines')
      .select('total')
      .eq('company_id', companyId)
      .eq('order_id', nextOrderId)
      .returns<Array<Pick<DbRow<'order_lines'>, 'total'>>>();

    if (rowsError) throw rowsError;

    const total = (rows ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0);

    const { error: updateError } = await supabase
      .from('orders')
      .update({ total: Math.round(total * 100) / 100 })
      .eq('company_id', companyId)
      .eq('id', nextOrderId);

    if (updateError) throw updateError;
  }

  const saveProjectMutation = useMutation({
    mutationFn: async () => {
      if (!projectQuery.data) throw new Error('Projekt saknas');

      const title = draftTitle.trim();
      if (!title) throw new Error('Titel krävs');

      if (!draftStatus) throw new Error('Kolumn krävs');
      if (draftStartDate && draftEndDate && draftEndDate < draftStartDate) {
        throw new Error('Slutdatum kan inte vara tidigare än startdatum');
      }

      const payload: Partial<ProjectRow> = {
        title,
        workflow_status: draftWorkflowStatus || draftStatus,
        customer_id: draftCustomerId === 'none' ? null : draftCustomerId,
        start_date: draftStartDate || null,
        end_date: draftEndDate || null,
        milestones: serializeProjectMilestones(draftMilestones)
      };

      const { error } = await supabase
        .from('projects')
        .update(payload)
        .eq('company_id', companyId)
        .eq('id', projectId);

      if (error) throw error;

      if ((draftWorkflowStatus || draftStatus) !== (projectQuery.data.workflow_status ?? projectQuery.data.status)) {
        return applyProjectStatusAutomation({
          companyId,
          projectId,
          workflowStatus: draftWorkflowStatus || draftStatus
        });
      }

      return { applied: false as const, targetStatus: null };
    },
    onSuccess: async (automationResult) => {
      await queryClient.invalidateQueries({ queryKey: ['project', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      addLocalActivity('Projekt uppdaterat');
      toast.success(
        automationResult?.applied
          ? 'Projekt uppdaterat och flyttat enligt regel'
          : 'Projekt uppdaterat'
      );
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Kunde inte spara projekt'));
    }
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const nextOrderId = await ensureOrderId();
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('company_id', companyId)
        .eq('id', nextOrderId);
      if (error) throw error;
      return status;
    },
    onSuccess: async (status) => {
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      addLocalActivity(`Orderstatus ändrad till ${orderStatusEtikett(status)}`);
      toast.success('Orderstatus uppdaterad');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Kunde inte uppdatera orderstatus'));
    }
  });

  const addLineMutation = useMutation({
    mutationFn: async () => {
      const title = lineTitle.trim();
      if (!title) throw new Error('Radtitel krävs');

      const qty = Math.max(0, toNumber(lineQty, 0));
      const unitPrice = Math.max(0, toNumber(lineUnitPrice, 0));
      const vatRate = Math.max(0, toNumber(lineVatRate, 0));
      const total = computeLineTotal(qty, unitPrice);
      const nextOrderId = await ensureOrderId();

      const { error } = await supabase.from('order_lines').insert({
        company_id: companyId,
        order_id: nextOrderId,
        title,
        qty,
        unit_price: unitPrice,
        vat_rate: vatRate,
        total
      });
      if (error) throw error;

      await recalcOrderTotal(nextOrderId);
      return { title, total };
    },
    onSuccess: async (result) => {
      setLineTitle('');
      setLineQty('1');
      setLineUnitPrice('0');
      setLineVatRate('25');
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-order-lines', companyId, projectId] });
      addLocalActivity(`Orderrad tillagd: ${result.title} (${result.total.toFixed(2)} kr)`);
      toast.success('Orderrad tillagd');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Kunde inte lägga till orderrad'));
    }
  });

  const updateLineMutation = useMutation({
    mutationFn: async (line: OrderLineRow) => {
      const qty = Math.max(0, Number(line.qty));
      const unitPrice = Math.max(0, Number(line.unit_price));
      const vatRate = Math.max(0, Number(line.vat_rate));
      const total = computeLineTotal(qty, unitPrice);

      const { error } = await supabase
        .from('order_lines')
        .update({ title: line.title, qty, unit_price: unitPrice, vat_rate: vatRate, total })
        .eq('company_id', companyId)
        .eq('id', line.id);
      if (error) throw error;

      if (orderId) await recalcOrderTotal(orderId);
      return { title: line.title, total };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-order-lines', companyId, projectId] });
      addLocalActivity(`Orderrad uppdaterad: ${result.title} (${result.total.toFixed(2)} kr)`);
      toast.success('Orderrad uppdaterad');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Kunde inte uppdatera orderrad'));
    }
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (line: OrderLineRow) => {
      const { error } = await supabase
        .from('order_lines')
        .delete()
        .eq('company_id', companyId)
        .eq('id', line.id);
      if (error) throw error;

      if (orderId) await recalcOrderTotal(orderId);
      return line;
    },
    onSuccess: async (line) => {
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-order-lines', companyId, projectId] });
      addLocalActivity(`Orderrad borttagen: ${line.title}`);
      toast.success('Orderrad borttagen');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Kunde inte ta bort orderrad'));
    }
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('Order saknas');
      return createInvoiceFromOrder(orderId);
    },
    onSuccess: async (result) => {
      const payload = (result ?? null) as Json | null;
      const summary = extractInvoiceSummary(result);
      setLatestInvoiceResult(payload);
      addLocalActivity(summary);
      toast.success(summary);
      await queryClient.invalidateQueries({ queryKey: ['project-order', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['invoices', companyId, projectId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Kunde inte skapa faktura'));
    }
  });

  const invoiceSourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of invoiceSourceCountsQuery.data ?? []) {
      counts.set(row.invoice_id, (counts.get(row.invoice_id) ?? 0) + 1);
    }
    return counts;
  }, [invoiceSourceCountsQuery.data]);

  const saveProjectMembersMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      const res = await fetch('/api/project-members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          companyId,
          projectId,
          userIds
        })
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; assignments?: ProjectMemberAssignmentRow[] }
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? 'Kunde inte uppdatera projektmedlemmar');
      }
      return body?.assignments ?? [];
    },
    onSuccess: async (assignments) => {
      queryClient.setQueryData<ProjectMemberAssignmentRow[]>(['project-member-assignments', companyId, projectId], assignments);
      await queryClient.invalidateQueries({ queryKey: ['project-member-assignments', companyId, projectId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Kunde inte uppdatera projektmedlemmar'));
    }
  });

  const availableMembers = useMemo(() => {
    const baseMembers = new Map<string, { id: string; company_id: string; user_id: string; role: Role; created_at: string; email: string | null; handle: string | null; display_name: string | null }>();

    for (const member of companyMemberOptionsQuery.data ?? []) {
      if (!baseMembers.has(member.user_id)) {
        baseMembers.set(member.user_id, {
          id: member.id,
          company_id: member.company_id,
          user_id: member.user_id,
          role: member.role,
          created_at: member.created_at,
          email: member.email,
          handle: member.handle,
          display_name: member.display_name
        });
      }
    }
    if (currentUserQuery.data?.id && !baseMembers.has(currentUserQuery.data.id)) {
      baseMembers.set(currentUserQuery.data.id, {
        id: `self-${currentUserQuery.data.id}`,
        company_id: companyId,
        user_id: currentUserQuery.data.id,
        role: role === 'auditor' ? 'auditor' : role,
        created_at: '',
        email: currentUserQuery.data.email,
        handle: currentUserQuery.data.email?.split('@')[0]?.toLowerCase() ?? null,
        display_name: null
      });
    }

    return Array.from(baseMembers.values()).map((member) => {
      return {
        ...member,
        color: '#3b82f6',
        avatar_path: null,
        avatar_url: null,
        emoji: null
      };
    });
  }, [companyId, companyMemberOptionsQuery.data, currentUserQuery.data, role]);
  const currentUserId = currentUserQuery.data?.id ?? '';
  const assignedMembers = useMemo(
    () => {
      const memberByUserId = new Map(availableMembers.map((member) => [member.user_id, member] as const));
      return (projectMemberAssignmentsQuery.data ?? [])
        .map((assignment) => {
          const member = memberByUserId.get(assignment.user_id);
          if (member) return member;
          return {
            id: assignment.id,
            company_id: assignment.company_id,
            user_id: assignment.user_id,
            role: 'member' as Role,
            created_at: assignment.created_at,
            email: null,
            handle: null,
            display_name: assignment.user_id,
            color: '#3b82f6',
            avatar_path: null,
            avatar_url: null,
            emoji: null
          };
        });
    },
    [availableMembers, projectMemberAssignmentsQuery.data]
  );
  const taskAssignableMembers = availableMembers;
  const responsibleMember = useMemo(
    () => availableMembers.find((member) => member.user_id === projectQuery.data?.responsible_user_id) ?? null,
    [availableMembers, projectQuery.data?.responsible_user_id]
  );
  const serverAssignedUserIds = useMemo(() => normalizeUserIdList(assignedMembers.map((member) => member.user_id)), [assignedMembers]);
  const effectiveAssignedUserIds = optimisticAssignedUserIds ?? serverAssignedUserIds;
  const assignedUserIds = useMemo(() => new Set(effectiveAssignedUserIds), [effectiveAssignedUserIds]);
  const filteredAvailableMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    const roleFiltered = memberRoleFilter === 'all' ? availableMembers : availableMembers.filter((member) => member.role === memberRoleFilter);
    if (!query) return roleFiltered;
    return roleFiltered.filter((member) => {
      const haystack = [member.email, member.handle, roleLabel(member.role)].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [availableMembers, memberRoleFilter, memberSearch]);
  const memberLabelByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of availableMembers) {
      map.set(
        member.user_id,
        getUserDisplayName({
          displayName: member.display_name,
          email: member.email,
          handle: member.handle,
          userId: member.user_id
        })
      );
    }
    return map;
  }, [availableMembers]);

  useEffect(() => {
    const desiredAssignedUserIds = optimisticAssignedUserIds;

    if (!desiredAssignedUserIds) {
      lastSubmittedAssignedUserIdsRef.current = null;
      return;
    }

    if (sameUserIdList(desiredAssignedUserIds, serverAssignedUserIds)) {
      lastSubmittedAssignedUserIdsRef.current = null;
      setOptimisticAssignedUserIds(null);
      return;
    }

    if (saveProjectMembersMutation.isPending) return;
    if (lastSubmittedAssignedUserIdsRef.current && sameUserIdList(lastSubmittedAssignedUserIdsRef.current, desiredAssignedUserIds)) return;

    lastSubmittedAssignedUserIdsRef.current = desiredAssignedUserIds;
    saveProjectMembersMutation.mutate(desiredAssignedUserIds, {
      onSuccess: () => {
        toast.success('Projektmedlemmar uppdaterade');
      }
    });
  }, [optimisticAssignedUserIds, saveProjectMembersMutation, serverAssignedUserIds]);

  function submitProjectMemberSelection(nextUserIds: string[]) {
    const normalized = normalizeUserIdList(nextUserIds);
    setOptimisticAssignedUserIds(normalized);
  }
  const activity = useMemo(() => {
    const items: ActivityItem[] = [...localActivity];

    if (projectQuery.data) {
      items.push({
        id: `project-created-${projectQuery.data.id}`,
        at: projectQuery.data.created_at,
        text: 'Projekt skapat',
        actorUserId: null,
        source: 'system'
      });
      items.push({
        id: `project-updated-${projectQuery.data.id}`,
        at: projectQuery.data.updated_at,
        text: 'Projekt senast uppdaterat',
        actorUserId: null,
        source: 'system'
      });
    }

    if (orderQuery.data) {
      items.push({
        id: `order-created-${orderQuery.data.id}`,
        at: orderQuery.data.created_at,
        text: `Order skapad (${orderStatusEtikett(orderQuery.data.status)})`,
        actorUserId: null,
        source: 'system'
      });
    }

    for (const line of linesQuery.data ?? []) {
      items.push({
        id: `line-created-${line.id}`,
        at: line.created_at,
        text: `Orderrad skapad: ${line.title}`,
        actorUserId: null,
        source: 'system'
      });
    }

    for (const invoice of invoicesQuery.data ?? []) {
      items.push({
        id: `invoice-${invoice.id}`,
        at: invoice.created_at,
        text: `Faktura ${invoice.invoice_no} skapad`,
        actorUserId: null,
        source: 'system'
      });
    }

    for (const update of projectUpdatesActivityQuery.data ?? []) {
      items.push({
        id: `project-update-${update.id}`,
        at: update.created_at,
        text: update.parent_id ? 'Svar i uppdateringstråd' : 'Ny projektuppdatering',
        actorUserId: update.created_by,
        source: 'user'
      });
    }

    for (const task of projectTasksActivityQuery.data ?? []) {
      items.push({
        id: `project-task-created-${task.id}`,
        at: task.created_at,
        text: `Uppgift skapad: ${task.title}`,
        actorUserId: task.created_by,
        source: 'user'
      });

      if (new Date(task.updated_at).getTime() > new Date(task.created_at).getTime() + 1000) {
        items.push({
          id: `project-task-updated-${task.id}`,
          at: task.updated_at,
          text: `Uppgift uppdaterad: ${task.title}`,
          actorUserId: task.assignee_user_id ?? task.created_by,
          source: 'user'
        });
      }
    }

    for (const entry of projectTimeActivityQuery.data ?? []) {
      items.push({
        id: `project-time-${entry.id}`,
        at: entry.created_at,
        text: `Tid rapporterad: ${Number(entry.hours).toFixed(1)} h (${new Date(entry.entry_date).toLocaleDateString('sv-SE')})`,
        actorUserId: entry.user_id,
        source: 'user'
      });
    }

    for (const assignment of projectMemberAssignmentsQuery.data ?? []) {
      items.push({
        id: `project-member-${assignment.id}`,
        at: assignment.created_at,
        text: `Medlem tilldelad: ${memberLabelByUserId.get(assignment.user_id) ?? assignment.user_id}`,
        actorUserId: assignment.created_by ?? assignment.user_id,
        source: 'user'
      });
    }

    for (const file of projectFilesActivityQuery.data ?? []) {
      items.push({
        id: `project-file-${file.id}`,
        at: file.created_at,
        text: file.version_no > 1 ? `Ny filversion: ${file.title ?? file.file_name}` : `Projektfil uppladdad: ${file.title ?? file.file_name}`,
        actorUserId: file.created_by,
        source: 'user'
      });
    }

    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [
    invoicesQuery.data,
    linesQuery.data,
    localActivity,
    memberLabelByUserId,
    orderQuery.data,
    projectFilesActivityQuery.data,
    projectMemberAssignmentsQuery.data,
    projectQuery.data,
    projectTasksActivityQuery.data,
    projectTimeActivityQuery.data,
    projectUpdatesActivityQuery.data
  ]);
  const setResponsibleMutation = useMutation({
    mutationFn: async (responsibleUserId: string | null) => {
      const res = await fetch('/api/project-responsible', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, projectId, responsibleUserId })
      });

      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error ?? 'Kunde inte uppdatera ansvarig');
      }
    },
    onSuccess: async (_, responsibleUserId) => {
      await queryClient.setQueryData<ProjectRow | null>(['project', companyId, projectId], (current) =>
        current ? { ...current, responsible_user_id: responsibleUserId } : current
      );
      await queryClient.invalidateQueries({ queryKey: ['project', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['project-member-assignments', companyId, projectId] });
      await queryClient.invalidateQueries({ queryKey: ['projects', companyId] });
      toast.success('Ansvarig uppdaterad');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Kunde inte uppdatera ansvarig'));
    }
  });
  const nextMilestone = useMemo(
    () =>
      sortProjectMilestones(draftMilestones)
        .filter((milestone) => !milestone.completed)
        [0] ?? null,
    [draftMilestones]
  );
  const orderedMilestones = useMemo(() => sortProjectMilestones(draftMilestones), [draftMilestones]);
  const planningAlerts = useMemo(() => {
    const today = todayIsoDate();
    const alerts: Array<{ id: string; title: string; detail: string; tone: 'danger' | 'warning' | 'info' }> = [];
    const overdueMilestones = draftMilestones.filter((milestone) => !milestone.completed && milestone.date && milestone.date < today);
    const upcomingMilestones = draftMilestones.filter((milestone) => !milestone.completed && milestone.date && milestone.date >= today).sort((a, b) => a.date.localeCompare(b.date));

    overdueMilestones.slice(0, 2).forEach((milestone) => {
      alerts.push({
        id: `overdue-${milestone.id}`,
        title: 'Försenat delmål',
        detail: `${milestone.title || 'Delmål'} skulle varit klart ${formatProjectDate(milestone.date)}`,
        tone: 'danger'
      });
    });

    if (projectQuery.data?.end_date) {
      if (projectQuery.data.end_date < today) {
        alerts.push({
          id: 'end-date-overdue',
          title: 'Projektet har passerat slutdatum',
          detail: `Slutdatumet var ${formatProjectDate(projectQuery.data.end_date)}.`,
          tone: 'danger'
        });
      } else {
        const upcomingEnd = Math.ceil((new Date(projectQuery.data.end_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
        if (upcomingEnd >= 0 && upcomingEnd <= 7) {
          alerts.push({
            id: 'end-date-soon',
            title: 'Slutdatum närmar sig',
            detail: `Projektet ska vara klart ${formatProjectDate(projectQuery.data.end_date)}.`,
            tone: 'warning'
          });
        }
      }
    }

    if (alerts.length === 0 && upcomingMilestones[0]) {
      alerts.push({
        id: `upcoming-${upcomingMilestones[0].id}`,
        title: 'Nästa delmål',
        detail: `${upcomingMilestones[0].title || 'Delmål'} • ${formatProjectDate(upcomingMilestones[0].date)}`,
        tone: 'info'
      });
    }

    return alerts;
  }, [draftMilestones, projectQuery.data?.end_date]);
  const hasPlanningAttention = planningAlerts.some((alert) => alert.tone === 'danger' || alert.tone === 'warning');

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab) return;
    if (hasAutoOpenedPlanningRef.current) return;
    if (!hasPlanningAttention) return;

    hasAutoOpenedPlanningRef.current = true;
    setActiveTab('planning');
  }, [hasPlanningAttention, searchParams]);

  if (projectQuery.isLoading) return <p>Laddar...</p>;
  if (!projectQuery.data) return <p>Projekt saknas.</p>;

  const project = projectQuery.data;
  const lines = linesQuery.data ?? [];
  const currentCustomer = (customersQuery.data ?? []).find((customer) => customer.id === draftCustomerId) ?? null;
  const statusValue = orderStatuses.includes((orderQuery.data?.status ?? 'draft') as OrderStatus)
    ? (orderQuery.data?.status as OrderStatus)
    : 'draft';
  const isEconomyLocked =
    economyLockQuery.data ?? (invoicesQuery.data ?? []).some((invoice) => invoice.status !== 'void');
  const isEconomyBusy = economyLockQuery.isPending;
  const isProjectMetaBusy = saveProjectMutation.isPending;
  const latestInvoice = invoicesQuery.data?.[0] ?? null;
  const latestActivityItem = activity[0] ?? null;
  const latestActivityActorLabel = latestActivityItem?.actorUserId ? memberLabelByUserId.get(latestActivityItem.actorUserId) ?? 'Intern användare' : null;
  const projectStatusLabel = projectColumnTitle(draftWorkflowStatus || project.workflow_status || project.status, statusColumns);
  const projectLogs = activity
    .map((item) => ({
      id: item.id,
      title: item.source === 'user' ? 'Aktivitetshistorik' : 'Systemhändelse',
      detail: item.actorUserId ? `${item.text} • av ${memberLabelByUserId.get(item.actorUserId) ?? 'Intern användare'}` : item.text,
      at: item.at
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <section className="space-y-3 md:space-y-4">
      <div className="flex items-start gap-3">
        <Button asChild variant="secondary" size="icon" aria-label="Tillbaka till projekt">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="space-y-0.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/40">Projekt</p>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl lg:text-2xl">{project.title}</h1>
        </div>
      </div>

      <div ref={containerRef} className="-mx-4 flex overflow-x-auto border-b border-border/70 px-4">
        {projectTabs.map((tab) => (
          <Button
            key={tab.id}
            ref={registerItem(tab.id)}
            type="button"
            variant="ghost"
            className={`shrink-0 rounded-none border-b-2 px-3 py-3 text-sm ${
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-foreground/60 hover:border-border hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.id === 'planning' && hasPlanningAttention ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : null}
              <span>{tab.label}</span>
            </span>
          </Button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4" {...swipeHandlers}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ProjectSummaryCard
              icon={FolderKanban}
              label="Projektstatus"
              value={projectStatusLabel}
              helper={project.status && project.status !== draftWorkflowStatus ? `kolumn: ${projectColumnTitle(project.status, statusColumns)}` : 'uppdatera status vid behov'}
            />
            <ProjectSummaryCard
              icon={CircleDollarSign}
              label="Ekonomi"
              value={`${Number(orderQuery.data?.total ?? 0).toFixed(2)} kr`}
              helper={
                orderId
                  ? `${lines.length} orderrader • ${invoicesQuery.data?.length ?? 0} fakturor`
                  : 'ingen order kopplad ännu'
              }
            />
            <ProjectSummaryCard
              icon={ReceiptText}
              label="Tidsplan"
              value={nextMilestone?.title || formatProjectDate(draftEndDate)}
              helper={nextMilestone?.date ? `nästa delmål ${formatProjectDate(nextMilestone.date)}` : `slutdatum ${formatProjectDate(draftEndDate)}`}
            />
            <ProjectSummaryCard
              icon={Users}
              label="Senaste aktivitet"
              value={latestActivityItem ? latestActivityItem.text : 'Ingen aktivitet ännu'}
              helper={
                latestActivityItem
                  ? `${new Date(latestActivityItem.at).toLocaleString('sv-SE')}${latestActivityActorLabel ? ` • ${latestActivityActorLabel}` : ''}`
                  : 'projektet väntar på första aktivitet'
              }
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle>Grundinfo</CardTitle>
                <p className="text-sm text-foreground/65">Redigera projektets titel, status och kund utan att behöva gå mellan flera block.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-sm">Titel</span>
                    <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} disabled={isProjectMetaBusy} />
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm">Projektstatus</span>
                    <Select value={draftWorkflowStatus} onValueChange={(value) => setDraftWorkflowStatus(value as ProjectStatus)}>
                      <SelectTrigger disabled={isProjectMetaBusy}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusColumns.map((column) => (
                          <SelectItem key={column.key} value={column.key}>
                            {column.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-sm">Kund</span>
                    <Select value={draftCustomerId} onValueChange={setDraftCustomerId}>
                      <SelectTrigger disabled={isProjectMetaBusy}>
                        <SelectValue placeholder="Välj kund" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen kund</SelectItem>
                        {(customersQuery.data ?? []).map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => saveProjectMutation.mutate()} disabled={saveProjectMutation.isPending}>
                    {saveProjectMutation.isPending ? 'Sparar...' : 'Spara projekt'}
                  </Button>
                  {orderId ? (
                    <Button asChild variant="outline">
                      <Link href={`/orders/${orderId}`}>
                        <span>Öppna order</span>
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                  {currentCustomer ? (
                    <Button asChild variant="outline">
                      <Link href={`/customers/${currentCustomer.id}` as Route}>
                        <span>Öppna kund</span>
                        <ArrowUpRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle>Projektfakta</CardTitle>
                  <p className="text-sm text-foreground/65">Det viktigaste om projektets kund, ekonomi och bemanning.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/70 bg-muted/10 p-3 sm:col-span-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Kund</p>
                      <p className="mt-1 font-medium">{currentCustomer?.name ?? 'Ingen kund kopplad'}</p>
                      <p className="mt-1 text-sm text-foreground/65">
                        {currentCustomer ? 'Kundrelation kopplad till projektet.' : 'Välj kund i grundinfo när projektet ska knytas till en kund.'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Tilldelade</p>
                      <p className="mt-1 text-2xl font-semibold">{assignedMembers.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Fakturor</p>
                      <p className="mt-1 text-2xl font-semibold">{invoicesQuery.data?.length ?? 0}</p>
                      {latestInvoice && (invoiceSourceCounts.get(latestInvoice.id) ?? 0) > 1 ? (
                        <p className="mt-1 text-xs text-primary">Samlingsfaktura finns</p>
                      ) : null}
                    </div>
                    <div className="rounded-xl border border-border/70 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Orderrader</p>
                      <p className="mt-1 text-2xl font-semibold">{lines.length}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Ordertotal</p>
                      <p className="mt-1 text-2xl font-semibold">{Number(orderQuery.data?.total ?? 0).toFixed(2)} kr</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="space-y-1">
                  <CardTitle>Tidsplan</CardTitle>
                  <p className="text-sm text-foreground/65">Datum och nästa hållpunkt utan att behöva hoppa till planeringsfliken.</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border/70 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Startdatum</p>
                      <p className="mt-1 font-medium">{formatProjectDate(draftStartDate)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Slutdatum</p>
                      <p className="mt-1 font-medium">{formatProjectDate(draftEndDate)}</p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/10 p-3 sm:col-span-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Nästa delmål</p>
                      <p className="mt-1 font-medium">{nextMilestone?.title || 'Inget delmål satt'}</p>
                      <p className="mt-1 text-sm text-foreground/65">
                        {nextMilestone?.date ? formatProjectDate(nextMilestone.date) : 'Gå till Tidsplan för att lägga till nästa delmål.'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'planning' && (
        <div className="space-y-4" {...swipeHandlers}>
          <Card>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Startdatum</p>
                  <p className="mt-1 font-medium">{formatProjectDate(draftStartDate)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Nästa delmål</p>
                  <p className="mt-1 font-medium">{nextMilestone?.title || 'Inget satt'}</p>
                  <p className="mt-1 text-xs text-foreground/55">{nextMilestone?.date ? formatProjectDate(nextMilestone.date) : 'Lägg till ett delmål'}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Slutdatum</p>
                  <p className="mt-1 font-medium">{formatProjectDate(draftEndDate)}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm">Startdatum</span>
                  <Input type="date" value={draftStartDate} onChange={(event) => setDraftStartDate(event.target.value)} disabled={isProjectMetaBusy} />
                </label>

                <label className="space-y-1">
                  <span className="text-sm">Slutdatum</span>
                  <Input type="date" value={draftEndDate} onChange={(event) => setDraftEndDate(event.target.value)} disabled={isProjectMetaBusy} />
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Delmål</p>
                    <p className="text-xs text-foreground/60">Planera nästa steg och viktiga hållpunkter för projektet.</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isProjectMetaBusy}
                    onClick={() =>
                      setDraftMilestones((prev) => [...prev, { id: crypto.randomUUID(), title: '', date: '', completed: false }])
                    }
                  >
                    Lägg till delmål
                  </Button>
                </div>

                {orderedMilestones.length === 0 ? (
                  <p className="text-sm text-foreground/65">Inga delmål ännu.</p>
                ) : (
                  <div className="space-y-2">
                    {orderedMilestones.map((milestone) => {
                      const today = todayIsoDate();
                      const isOverdue = !milestone.completed && Boolean(milestone.date) && milestone.date < today;
                      const isUpcoming = !milestone.completed && Boolean(milestone.date) && milestone.date >= today;

                      return (
                        <div
                          key={milestone.id}
                          className={`grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_180px_auto_auto] ${
                            milestone.completed
                              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10'
                              : isOverdue
                                ? 'border-rose-200 bg-rose-50 dark:border-rose-500/25 dark:bg-rose-500/10'
                                : isUpcoming
                                  ? 'border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10'
                                  : 'border-border/60 bg-background/60'
                          }`}
                        >
                          <Input
                            placeholder="Delmål, t.ex. Första utkast klart"
                            value={milestone.title}
                            disabled={isProjectMetaBusy}
                            onChange={(event) =>
                              setDraftMilestones((prev) =>
                                prev.map((item) => (item.id === milestone.id ? { ...item, title: event.target.value } : item))
                              )
                            }
                          />
                          <Input
                            type="date"
                            value={milestone.date}
                            disabled={isProjectMetaBusy}
                            onChange={(event) =>
                              setDraftMilestones((prev) =>
                                prev.map((item) => (item.id === milestone.id ? { ...item, date: event.target.value } : item))
                              )
                            }
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant={milestone.completed ? 'secondary' : 'outline'}
                            disabled={isProjectMetaBusy}
                            onClick={() =>
                              setDraftMilestones((prev) =>
                                prev.map((item) => (item.id === milestone.id ? { ...item, completed: !item.completed } : item))
                              )
                            }
                          >
                            {milestone.completed ? 'Klart' : 'Markera klar'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isProjectMetaBusy}
                            onClick={() => setDraftMilestones((prev) => prev.filter((item) => item.id !== milestone.id))}
                          >
                            Ta bort
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => saveProjectMutation.mutate()} disabled={saveProjectMutation.isPending}>
                  {saveProjectMutation.isPending ? 'Sparar...' : 'Spara tidsplan'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

        {activeTab === 'tasks' && (
          <div {...swipeHandlers}>
            <ProjectTasksPanel companyId={companyId} projectId={projectId} role={role} members={taskAssignableMembers} milestones={orderedMilestones} />
          </div>
        )}

        {activeTab === 'time' && (
          <div {...swipeHandlers}>
            <ProjectTimePanel companyId={companyId} projectId={projectId} role={role} members={taskAssignableMembers} orderId={orderId} />
          </div>
        )}

      {activeTab === 'economy' && (
        <div className="space-y-4" {...swipeHandlers}>
          <ProjectFinancePanel companyId={companyId} projectId={projectId} role={role} isLocked={isEconomyLocked || isEconomyBusy} />

          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Total: {Number(orderQuery.data?.total ?? 0).toFixed(2)} kr</Badge>{(isEconomyLocked || isEconomyBusy) && <Badge>Låst efter fakturering</Badge>}

                <RoleGate
                  role={role}
                  allow={['finance', 'admin']}
                  fallback={<p className="text-sm text-foreground/70">Ekonomi/Admin kan ändra orderstatus och skapa faktura.</p>}
                >
                  <div className="w-52">
                    <Select
                      value={statusValue}
                      onValueChange={(value) => {
                        const next = value as OrderStatus;
                        if (next === 'cancelled' && statusValue !== 'cancelled') {
                          setPendingOrderStatus(next);
                          setCancelConfirmOpen(true);
                          return;
                        }
                        updateOrderStatusMutation.mutate(next);
                      }}
                    >
                      <SelectTrigger disabled={isEconomyLocked || isEconomyBusy}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {orderStatusEtikett(status)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="secondary"
                    onClick={() => invoiceMutation.mutate()}
                    disabled={invoiceMutation.isPending || !orderId || !canManageOrder(role) || isEconomyLocked || isEconomyBusy}
                  >
                    {invoiceMutation.isPending ? 'Skapar...' : isEconomyLocked ? 'Faktura finns redan' : 'Skapa faktura'}
                  </Button>
                </RoleGate>
              </div>

              {latestInvoiceResult && (
                <Card className="border-dashed">
                  <CardContent className="p-3 text-sm">
                    <p className="font-medium">Senaste fakturasvar</p>
                    <p className="text-foreground/70">{extractInvoiceSummary(latestInvoiceResult)}</p>
                    <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(latestInvoiceResult, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Lägg till orderrad</p>
                <div className="grid gap-2 md:grid-cols-5">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Titel</span>
                    <Input value={lineTitle} onChange={(e) => setLineTitle(e.target.value)} placeholder="T.ex. Designarbete" disabled={isEconomyLocked || isEconomyBusy} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Antal</span>
                    <Input value={lineQty} onChange={(e) => setLineQty(e.target.value)} type="number" min="0" step="0.01" placeholder="1" disabled={isEconomyLocked || isEconomyBusy} />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">A-pris</span>
                    <Input
                      value={lineUnitPrice}
                      onChange={(e) => setLineUnitPrice(e.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      disabled={isEconomyLocked || isEconomyBusy}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Moms %</span>
                    <Input value={lineVatRate} onChange={(e) => setLineVatRate(e.target.value)} type="number" min="0" step="0.01" placeholder="25" disabled={isEconomyLocked || isEconomyBusy} />
                  </label>
                </div>
                <Button className="mt-2" onClick={() => addLineMutation.mutate()} disabled={addLineMutation.isPending || isEconomyLocked || isEconomyBusy}>
                  {addLineMutation.isPending ? 'Lägger till...' : 'Lägg till rad'}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Antal</TableHead>
                    <TableHead>A-pris</TableHead>
                    <TableHead>Moms %</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="text-right">Åtgärder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-foreground/70">
                        Inga orderrader ännu.
                      </TableCell>
                    </TableRow>
                  )}

                  {lines.map((line) => (
                    <EditableLineRow
                      key={line.id}
                      line={line}
                      saving={updateLineMutation.isPending || deleteLineMutation.isPending}
                      canEdit={!isEconomyLocked && !isEconomyBusy}
                      onSave={(nextLine) => updateLineMutation.mutate(nextLine)}
                      onDelete={() => setDeleteTarget(line)}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fakturor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {invoicesQuery.isLoading && <p className="text-sm text-foreground/70">Laddar fakturor...</p>}
                {!invoicesQuery.isLoading && (invoicesQuery.data?.length ?? 0) === 0 && (
                  <p className="text-sm text-foreground/70">Inga fakturor ännu.</p>
                )}

                {(invoicesQuery.data ?? []).map((item) => (
                  <div key={item.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{item.invoice_no}</p>
                        {(invoiceSourceCounts.get(item.id) ?? 0) > 1 ? <Badge>Samlingsfaktura</Badge> : null}
                      </div>
                      <Badge>{fakturaStatusEtikett(item.status)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-foreground/70">
                      {new Date(item.created_at).toLocaleString('sv-SE')} • Förfallo: {new Date(item.due_date).toLocaleDateString('sv-SE')} • Total:{' '}
                      {Number(item.total).toFixed(2)} {item.currency}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/invoices/${item.id}`}>Öppna</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/api/invoices/${item.id}/export?compact=1`}>Exportera JSON</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/invoices/${item.id}/print`} target="_blank">
                          Skriv ut / PDF
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'attachments' && (
        <Card {...swipeHandlers}>
          <CardContent className="pt-4">
            <ProjectFilesPanel companyId={companyId} projectId={projectId} role={role} members={availableMembers} />
          </CardContent>
        </Card>
      )}

      {activeTab === 'members' && (
        <Card {...swipeHandlers}>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium text-foreground/80">Projektansvarig</p>
              <p className="mt-1 font-medium">
                {project.responsible_user_id
                  ? memberLabelByUserId.get(project.responsible_user_id) ??
                    (project.responsible_user_id === currentUserId
                      ? getUserDisplayName({
                          email: currentUserQuery.data?.email,
                          userId: currentUserId
                        })
                      : project.responsible_user_id)
                  : 'Ingen ansvarig'}
              </p>
              {role !== 'auditor' ? (
                <div className="mt-3 space-y-3">
                  <Select
                    value={project.responsible_user_id ?? 'none'}
                    onValueChange={(value) => setResponsibleMutation.mutate(value === 'none' ? null : value)}
                    disabled={setResponsibleMutation.isPending}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Välj ansvarig" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ingen ansvarig</SelectItem>
                      {availableMembers.map((member) => (
                        <SelectItem key={member.id} value={member.user_id}>
                          {memberLabelByUserId.get(member.user_id) ?? member.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={setResponsibleMutation.isPending || !currentUserId}
                      onClick={() => setResponsibleMutation.mutate(currentUserId)}
                    >
                      Sätt mig som ansvarig
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            {assignedMembers.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground/80">Tilldelade medlemmar</p>
                  <p className="text-xs text-foreground/60">De här personerna är just nu kopplade till projektet.</p>
                </div>
                {assignedMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ProfileBadge
                          label={memberLabelByUserId.get(member.user_id) ?? member.user_id}
                          color={member.color}
                          avatarUrl={member.avatar_url}
                          emoji={member.emoji}
                          className="h-8 w-8 shrink-0"
                          textClassName="text-xs font-semibold text-white"
                        />
                        <p className="truncate text-sm font-medium">{memberLabelByUserId.get(member.user_id) ?? member.user_id}</p>
                      </div>
                      <p className="mt-1 text-xs text-foreground/55">Tilldelad projektet</p>
                    </div>
                    <Badge>{roleLabel(member.role)}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground/80">Tilldelade medlemmar</p>
                <p className="text-sm text-foreground/70">Inga medlemmar är tilldelade ännu.</p>
              </div>
            )}

            {role !== 'auditor' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground/80">Medlemmar att lägga till</p>
                    <p className="text-xs text-foreground/60">Tryck på en profil för att lägga till eller ta bort den från projektet.</p>
                  </div>
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
                        {filter === 'all' ? 'Alla' : roleLabel(filter)}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  placeholder="Sök på e-post, namn eller roll"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                />
                <div className="flex flex-wrap gap-3">
                  {filteredAvailableMembers.map((member) => {
                    const isAssigned = assignedUserIds.has(member.user_id);
                    const label = getUserDisplayName({
                      displayName: member.display_name,
                      email: member.email,
                      handle: member.handle,
                      userId: member.user_id
                    });
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className={`flex w-[84px] flex-col items-center gap-1.5 rounded-2xl px-1 py-1.5 text-center transition ${
                          isAssigned ? 'bg-primary/8 text-foreground' : 'text-foreground/80 hover:bg-muted/40'
                        }`}
                        onClick={() => {
                          const next = new Set(assignedUserIds);
                          if (isAssigned) next.delete(member.user_id);
                          else next.add(member.user_id);
                          submitProjectMemberSelection(Array.from(next));
                        }}
                        title={label}
                      >
                        <div className="relative">
                          <ProfileBadge
                            label={label}
                            color={member.color}
                            avatarUrl={member.avatar_url}
                            emoji={member.emoji}
                            className={`h-11 w-11 shrink-0 ring-2 transition ${
                              isAssigned ? 'ring-primary' : 'ring-transparent'
                            }`}
                            textClassName="text-xs font-semibold text-white"
                          />
                          <span
                            className={`absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-background text-[10px] font-semibold ${
                              isAssigned ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/55'
                            }`}
                          >
                            {isAssigned ? '✓' : '+'}
                          </span>
                        </div>
                        <span className="line-clamp-2 text-[11px] font-medium leading-tight">{label}</span>
                        <span className="text-[10px] uppercase tracking-[0.12em] text-foreground/45">{roleLabel(member.role)}</span>
                      </button>
                    );
                  })}
                </div>
                {filteredAvailableMembers.length === 0 ? <p className="text-sm text-foreground/65">Inga medlemmar matchar sökningen.</p> : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {activeTab === 'logs' && (
        <Card {...swipeHandlers}>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Projekt-ID</p>
              <p className="mt-1 break-all font-mono text-foreground/70">{project.id}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Bolags-ID</p>
              <p className="mt-1 break-all font-mono text-foreground/70">{project.company_id}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Kolumnnyckel</p>
              <p className="mt-1 text-foreground/70">{project.status}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Projektstatus</p>
              <p className="mt-1 text-foreground/70">{project.workflow_status ?? project.status}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Position</p>
              <p className="mt-1 text-foreground/70">{project.position}</p>
            </div>
            {orderId ? (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">Order-ID</p>
                <p className="mt-1 break-all font-mono text-foreground/70">{orderId}</p>
              </div>
            ) : null}
            <div className="space-y-3 pt-1">
              <p className="text-sm font-medium text-foreground/80">Aktivitetshistorik / systemhändelser</p>
              {projectLogs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{log.title}</p>
                    <p className="text-xs text-foreground/55">{new Date(log.at).toLocaleString('sv-SE')}</p>
                  </div>
                  <p className="mt-1 text-foreground/70">{log.detail}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-dashed p-3 text-sm text-foreground/70">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                <p>Senaste aktivitet: {latestActivityItem ? new Date(latestActivityItem.at).toLocaleString('sv-SE') : 'Ingen ännu'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'updates' && planningAlerts.length > 0 ? (
        <Card>
          <CardContent className="space-y-2">
            {planningAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  alert.tone === 'danger'
                    ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-100'
                    : alert.tone === 'warning'
                      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100'
                      : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100'
                }`}
              >
                <p className="font-medium">{alert.title}</p>
                <p className="mt-1 text-sm/5 opacity-90">{alert.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <ProjectUpdatesPanel
        companyId={companyId}
        projectId={projectId}
        isActive={activeTab === 'updates'}
        onOpenUpdates={() => setActiveTab('updates')}
        highlightUpdateId={searchParams.get('update')}
      />

      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bekräfta avbrytning</DialogTitle>
            <DialogDescription>
              Är du säker på att ordern ska sättas till avbruten? Detta bör endast användas när ordern inte ska faktureras.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCancelConfirmOpen(false)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!pendingOrderStatus) return;
                updateOrderStatusMutation.mutate(pendingOrderStatus);
                setCancelConfirmOpen(false);
                setPendingOrderStatus(null);
              }}
            >
              Bekräfta cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort orderrad</DialogTitle>
            <DialogDescription>
              Vill du ta bort raden <strong>{deleteTarget?.title}</strong>? Detta kan inte ångras.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                deleteLineMutation.mutate(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Ta bort
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function EditableLineRow({
  line,
  saving,
  canEdit,
  onSave,
  onDelete
}: {
  line: OrderLineRow;
  saving: boolean;
  canEdit: boolean;
  onSave: (line: OrderLineRow) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<OrderLineRow>(line);

  useEffect(() => {
    setDraft(line);
  }, [line]);

  return (
    <TableRow>
      <TableCell>
        <Input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} disabled={!canEdit} />
      </TableCell>
      <TableCell>
        <Input
          value={String(draft.qty)}
          onChange={(e) => setDraft((prev) => ({ ...prev, qty: toNumber(e.target.value) }))}
          type="number"
          min="0"
          step="0.01"
          disabled={!canEdit}
        />
      </TableCell>
      <TableCell>
        <Input
          value={String(draft.unit_price)}
          onChange={(e) => setDraft((prev) => ({ ...prev, unit_price: toNumber(e.target.value) }))}
          type="number"
          min="0"
          step="0.01"
          disabled={!canEdit}
        />
      </TableCell>
      <TableCell>
        <Input
          value={String(draft.vat_rate)}
          onChange={(e) => setDraft((prev) => ({ ...prev, vat_rate: toNumber(e.target.value) }))}
          type="number"
          min="0"
          step="0.01"
          disabled={!canEdit}
        />
      </TableCell>
      <TableCell>{computeLineTotal(Number(draft.qty), Number(draft.unit_price)).toFixed(2)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => onSave(draft)} disabled={saving || !canEdit}>
            Spara
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={saving || !canEdit}>
            Ta bort
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
