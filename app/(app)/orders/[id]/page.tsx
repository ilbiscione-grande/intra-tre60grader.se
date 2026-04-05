'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowLeft, CalendarDays, CircleDollarSign, FolderOpen, Paperclip, ShieldCheck, Users } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import RoleGate from '@/components/common/RoleGate';
import ActionSheet from '@/components/common/ActionSheet';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import SimpleSelect from '@/components/ui/simple-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getUserDisplayName } from '@/features/profile/profileBadge';
import {
  buildOrderInvoiceReadinessChecklist,
  getInvoiceReadinessDescription,
  getInvoiceReadinessLabel,
  getInvoiceReadinessNextStep,
  getInvoiceReadinessOptions,
  getInvoiceReadinessOwner,
  resolveInvoiceReadinessStatus,
  type InvoiceReadinessStatus
} from '@/lib/finance/invoiceReadiness';
import { getOrderInvoiceProgressLabel, resolveOrderInvoiceProgress } from '@/lib/finance/orderInvoiceProgress';
import { createInvoiceFromOrder, createPartialInvoiceFromOrder, createPartialInvoiceFromOrderLines } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import type { Database, Json, TableRow as DbRow } from '@/lib/supabase/database.types';
import type { Role } from '@/lib/types';
import { useAutoScrollActiveTab } from '@/lib/ui/useAutoScrollActiveTab';
import { useSwipeTabs } from '@/lib/ui/useSwipeTabs';

type OrderRow = Pick<
  DbRow<'orders'>,
  'id' | 'order_no' | 'project_id' | 'status' | 'order_kind' | 'parent_order_id' | 'root_order_id' | 'sort_index' | 'invoice_readiness_status' | 'total' | 'created_at'
>;
type ProjectOrderRollupRow = Database['public']['Views']['project_order_rollups']['Row'];
type ProjectRow = Pick<DbRow<'projects'>, 'id' | 'title' | 'customer_id' | 'invoice_readiness_status'>;
type CustomerRow = Pick<DbRow<'customers'>, 'id' | 'name'>;
type OrderLineRow = Pick<DbRow<'order_lines'>, 'id' | 'title' | 'qty' | 'unit_price' | 'vat_rate' | 'total' | 'created_at'>;
type InvoiceSourceLinkRow = Pick<DbRow<'invoice_sources'>, 'invoice_id' | 'order_id' | 'project_id' | 'position' | 'allocated_total'>;
type InvoiceSourceLineLinkRow = Pick<DbRow<'invoice_source_lines'>, 'invoice_id' | 'order_id' | 'order_line_id' | 'allocated_total'>;
type InvoiceSourceCountRow = Pick<DbRow<'invoice_sources'>, 'invoice_id'>;
type InvoiceRow = Pick<
  DbRow<'invoices'>,
  'id' | 'invoice_no' | 'kind' | 'status' | 'currency' | 'total' | 'created_at' | 'attachment_path' | 'due_date' | 'order_id' | 'project_id' | 'credit_for_invoice_id' | 'lines_snapshot'
>;
type MemberView = {
  id: string;
  company_id: string;
  user_id: string;
  role: Role;
  created_at: string;
  email: string | null;
  display_name: string | null;
};
type OrderTab = 'overview' | 'updates' | 'economy' | 'attachments' | 'members' | 'logs';
type PartialInvoiceMode = 'quarter' | 'half' | 'remaining' | 'custom';
type PartialInvoiceMethod = 'amount' | 'lines';
type OrderLineFilter = 'all' | 'not_invoiced' | 'partially_invoiced' | 'fully_invoiced';

type OrderHierarchyNodeRow = Database['public']['Views']['order_hierarchy_nodes']['Row'];

function hierarchyNodeToOrderRow(node: Pick<
  OrderHierarchyNodeRow,
  'order_id' | 'order_no' | 'project_id' | 'status' | 'order_kind' | 'parent_order_id' | 'root_order_id' | 'sort_index' | 'invoice_readiness_status' | 'total' | 'created_at'
>): OrderRow {
  return {
    id: node.order_id ?? '',
    order_no: node.order_no ?? null,
    project_id: node.project_id ?? '',
    status: node.status ?? 'draft',
    order_kind: node.order_kind ?? 'primary',
    parent_order_id: node.parent_order_id ?? null,
    root_order_id: node.root_order_id ?? '',
    sort_index: node.sort_index ?? 0,
    invoice_readiness_status: node.invoice_readiness_status ?? 'not_ready',
    total: node.total ?? 0,
    created_at: node.created_at ?? new Date(0).toISOString()
  };
}

const orderStatuses = ['draft', 'sent', 'paid', 'cancelled', 'invoiced'] as const;
type OrderStatus = (typeof orderStatuses)[number];
const orderTabs: Array<{ id: OrderTab; label: string }> = [
  { id: 'overview', label: 'Översikt' },
  { id: 'updates', label: 'Uppdateringar' },
  { id: 'economy', label: 'Ekonomi' },
  { id: 'attachments', label: 'Bilagor' },
  { id: 'members', label: 'Medlemmar' },
  { id: 'logs', label: 'Loggar' }
];

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

function orderStatusIconClass(status: string) {
  if (status === 'paid' || status === 'invoiced') return 'text-emerald-600';
  if (status === 'cancelled') return 'text-rose-600';
  if (status === 'sent') return 'text-sky-600';
  return 'text-amber-600';
}

function orderKindLabel(kind: string) {
  const map: Record<string, string> = {
    primary: 'Huvudorder',
    change: 'Ändringsorder',
    supplement: 'Tilläggsorder'
  };
  return map[kind] ?? kind;
}

function orderKindPurposeText(kind: string) {
  if (kind === 'change') return 'Den här ordern används för ändringar eller omförhandlingar av tidigare beställning.';
  if (kind === 'supplement') return 'Den här ordern används för tilläggsarbete eller extra omfattning utöver huvudordern.';
  return 'Den här ordern är huvudbeställningen för projektet.';
}

function orderKindSuggestedLineTitle(kind: string) {
  if (kind === 'change') return 'Ändringsarbete enligt överenskommelse';
  if (kind === 'supplement') return 'Tilläggsarbete enligt överenskommelse';
  return 'Arbete enligt huvudorder';
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

function fakturaTypEtikett(kind: string) {
  if (kind === 'credit_note') return 'Kreditfaktura';
  return 'Faktura';
}

function canManageOrder(role: Role) {
  return role === 'finance' || role === 'admin';
}

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

function roleLabel(role: Role) {
  const map: Record<Role, string> = {
    member: 'Medlem',
    finance: 'Ekonomi',
    admin: 'Admin',
    auditor: 'Revisor'
  };
  return map[role];
}

function getOrderLineInvoiceStatusLabel(invoicedTotal: number, grossTotal: number) {
  if (grossTotal <= 0) return 'Ej fakturerad';
  if (invoicedTotal <= 0) return 'Ej fakturerad';
  if (invoicedTotal + 0.01 >= grossTotal) return 'Slutfakturerad';
  return 'Delfakturerad';
}

function asInvoiceLines(value: Json | null | undefined) {
  if (!Array.isArray(value)) return [] as Array<Record<string, unknown>>;
  return value.filter((item) => typeof item === 'object' && item !== null) as Array<Record<string, unknown>>;
}

function getInvoiceLineGrossTotal(line: Record<string, unknown>) {
  const total = Number(line.total ?? 0);
  const vatRate = Number(line.vat_rate ?? 0);
  return total * (1 + vatRate / 100);
}

function extractInvoiceSummary(result: unknown) {
  if (!result || typeof result !== 'object') return 'Faktura skapad';
  const record = result as Record<string, unknown>;
  const invoiceNo = record.invoice_no ?? record.invoiceNo ?? record.number;
  if (typeof invoiceNo === 'string' && invoiceNo.trim()) return `Faktura skapad: ${invoiceNo}`;
  return 'Faktura skapad';
}

function ReadinessChecklist({
  items
}: {
  items: Array<{ id: string; label: string; done: boolean; detail?: string }>;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-lg border px-3 py-2 text-sm ${
            item.done
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100'
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/20 text-[11px] font-semibold">
              {item.done ? '✓' : '!'}
            </span>
            <div className="min-w-0">
              <p className="font-medium">{item.label}</p>
              {item.detail ? <p className="mt-0.5 text-xs opacity-80">{item.detail}</p> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrderDetailsPage() {
  const { companyId, role } = useAppContext();
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<OrderTab>('overview');
  const [partialInvoiceDialogOpen, setPartialInvoiceDialogOpen] = useState(false);
  const [partialInvoiceMethod, setPartialInvoiceMethod] = useState<PartialInvoiceMethod>('amount');
  const [partialInvoiceMode, setPartialInvoiceMode] = useState<PartialInvoiceMode>('remaining');
  const [partialInvoiceAmount, setPartialInvoiceAmount] = useState('');
  const [selectedPartialLineIds, setSelectedPartialLineIds] = useState<string[]>([]);
  const [orderLineFilter, setOrderLineFilter] = useState<OrderLineFilter>('all');
  const [lineTitle, setLineTitle] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineUnitPrice, setLineUnitPrice] = useState('0');
  const [lineVatRate, setLineVatRate] = useState('25');
  const [deleteTarget, setDeleteTarget] = useState<OrderLineRow | null>(null);
  const [mobileEditTarget, setMobileEditTarget] = useState<OrderLineRow | null>(null);
  const swipeHandlers = useSwipeTabs({
    tabs: orderTabs.map((tab) => tab.id),
    activeTab,
    onChange: setActiveTab
  });
  const { containerRef, registerItem } = useAutoScrollActiveTab(activeTab);

  const orderQuery = useQuery<OrderRow | null>({
    queryKey: ['order', companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,order_no,project_id,status,order_kind,parent_order_id,root_order_id,sort_index,invoice_readiness_status,total,created_at')
        .eq('company_id', companyId)
        .eq('id', orderId)
        .maybeSingle<OrderRow>();
      if (error) throw error;
      return data;
    }
  });

  const projectQuery = useQuery<ProjectRow | null>({
    queryKey: ['order-project', companyId, orderQuery.data?.project_id ?? 'none'],
    enabled: Boolean(orderQuery.data?.project_id),
    queryFn: async () => {
      const projectId = orderQuery.data?.project_id;
      if (!projectId) return null;
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,customer_id,invoice_readiness_status')
        .eq('company_id', companyId)
        .eq('id', projectId)
        .maybeSingle<ProjectRow>();
      if (error) throw error;
      return data;
    }
  });

  const projectOrdersQuery = useQuery<OrderRow[]>({
    queryKey: ['order-project-orders', companyId, orderQuery.data?.project_id ?? 'none'],
    enabled: Boolean(orderQuery.data?.project_id),
    queryFn: async () => {
      const projectId = orderQuery.data?.project_id;
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('order_hierarchy_nodes')
        .select('order_id,order_no,project_id,status,order_kind,parent_order_id,root_order_id,sort_index,invoice_readiness_status,total,created_at')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .order('sort_index', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<OrderHierarchyNodeRow[]>();
      if (error) throw error;
      return (data ?? []).map(hierarchyNodeToOrderRow);
    }
  });

  const orderFamilyRollupsQuery = useQuery<ProjectOrderRollupRow[]>({
    queryKey: ['order-family-rollups', companyId, orderQuery.data?.project_id ?? 'none'],
    enabled: Boolean(orderQuery.data?.project_id),
    queryFn: async () => {
      const projectId = orderQuery.data?.project_id;
      if (!projectId) return [];
      const { data, error } = await supabase
        .from('project_order_rollups')
        .select('*')
        .eq('company_id', companyId)
        .eq('project_id', projectId)
        .returns<ProjectOrderRollupRow[]>();
      if (error) throw error;
      return data ?? [];
    }
  });

  const customerQuery = useQuery<CustomerRow | null>({
    queryKey: ['order-customer', companyId, projectQuery.data?.customer_id ?? 'none'],
    enabled: Boolean(projectQuery.data?.customer_id),
    queryFn: async () => {
      const customerId = projectQuery.data?.customer_id;
      if (!customerId) return null;
      const { data, error } = await supabase
        .from('customers')
        .select('id,name')
        .eq('company_id', companyId)
        .eq('id', customerId)
        .maybeSingle<CustomerRow>();
      if (error) throw error;
      return data;
    }
  });

  const linesQuery = useQuery<OrderLineRow[]>({
    queryKey: ['order-lines', companyId, orderId],
    queryFn: async () => {
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
    queryKey: ['order-invoice-source-links', companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_sources')
        .select('invoice_id,order_id,project_id,position,allocated_total')
        .eq('company_id', companyId)
        .eq('order_id', orderId)
        .order('position', { ascending: true })
        .returns<InvoiceSourceLinkRow[]>();
      if (error) throw error;
      return data ?? [];
    }
  });

  const invoiceSourceLineLinksQuery = useQuery<InvoiceSourceLineLinkRow[]>({
    queryKey: ['order-invoice-source-line-links', companyId, orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_source_lines')
        .select('invoice_id,order_id,order_line_id,allocated_total')
        .eq('company_id', companyId)
        .eq('order_id', orderId)
        .returns<InvoiceSourceLineLinkRow[]>();
      if (error) throw error;
      return data ?? [];
    }
  });

  const invoicesQuery = useQuery<InvoiceRow[]>({
    queryKey: ['order-invoices', companyId, orderId, (invoiceSourceLinksQuery.data ?? []).map((row) => row.invoice_id).join(',')],
    queryFn: async () => {
      const invoiceIds = (invoiceSourceLinksQuery.data ?? []).map((row) => row.invoice_id);
      let baseQuery = supabase
        .from('invoices')
        .select('id,invoice_no,kind,status,currency,total,created_at,attachment_path,due_date,order_id,project_id,credit_for_invoice_id,lines_snapshot')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (invoiceIds.length > 0) {
        baseQuery = baseQuery.in('id', invoiceIds);
      } else {
        baseQuery = baseQuery.eq('order_id', orderId);
      }

      const { data: baseInvoices, error: baseError } = await baseQuery.returns<InvoiceRow[]>();
      if (baseError) throw baseError;

      const baseInvoiceIds = (baseInvoices ?? []).map((row) => row.id);
      if (baseInvoiceIds.length === 0) {
        return baseInvoices ?? [];
      }

      const { data: creditInvoices, error: creditError } = await supabase
        .from('invoices')
        .select('id,invoice_no,kind,status,currency,total,created_at,attachment_path,due_date,order_id,project_id,credit_for_invoice_id,lines_snapshot')
        .eq('company_id', companyId)
        .eq('kind', 'credit_note')
        .in('credit_for_invoice_id', baseInvoiceIds)
        .order('created_at', { ascending: false })
        .returns<InvoiceRow[]>();

      if (creditError) throw creditError;

      const merged = [...(baseInvoices ?? []), ...(creditInvoices ?? [])];
      const deduped = Array.from(new Map(merged.map((row) => [row.id, row])).values());
      deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return deduped;
    }
  });

  const invoiceSourceCountsQuery = useQuery<InvoiceSourceCountRow[]>({
    queryKey: ['order-invoice-source-counts', companyId, (invoicesQuery.data ?? []).map((row) => row.id).join(',')],
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

  const membersQuery = useQuery<MemberView[]>({
    queryKey: ['order-company-members', companyId],
    enabled: role === 'admin',
    queryFn: async () => {
      const res = await fetch(`/api/admin/members?companyId=${companyId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Kunde inte läsa medlemmar');
      }
      const body = (await res.json()) as { members: MemberView[] };
      return body.members ?? [];
    }
  });

  async function recalcOrderTotal(nextOrderId: string) {
    const { data: rows, error: rowsError } = await supabase
      .from('order_lines')
      .select('total')
      .eq('company_id', companyId)
      .eq('order_id', nextOrderId)
      .returns<Array<Pick<DbRow<'order_lines'>, 'total'>>>();

    if (rowsError) throw rowsError;

    const nextTotal = Math.round((rows ?? []).reduce((sum, row) => sum + Number(row.total ?? 0), 0) * 100) / 100;
    const { error: updateError } = await supabase
      .from('orders')
      .update({ total: nextTotal })
      .eq('company_id', companyId)
      .eq('id', nextOrderId);

    if (updateError) throw updateError;
  }

  const updateStatusMutation = useMutation({
    mutationFn: async (status: OrderStatus) => {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('company_id', companyId)
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders', companyId] });
      toast.success('Orderstatus uppdaterad');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera status')
  });

  const updateInvoiceReadinessMutation = useMutation({
    mutationFn: async (status: InvoiceReadinessStatus) => {
      const { error } = await supabase
        .from('orders')
        .update({ invoice_readiness_status: status })
        .eq('company_id', companyId)
        .eq('id', orderId);
      if (error) throw error;
      return status;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders', companyId] });
      toast.success('Faktureringsläge uppdaterat');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera faktureringsläge')
  });

  const addLineMutation = useMutation({
    mutationFn: async () => {
      const title = lineTitle.trim();
      if (!title) throw new Error('Radtitel krävs');

      const qty = Math.max(0, toNumber(lineQty, 0));
      const unitPrice = Math.max(0, toNumber(lineUnitPrice, 0));
      const vatRate = Math.max(0, toNumber(lineVatRate, 0));
      const total = computeLineTotal(qty, unitPrice);

      const { error } = await supabase.from('order_lines').insert({
        company_id: companyId,
        order_id: orderId,
        title,
        qty,
        unit_price: unitPrice,
        vat_rate: vatRate,
        total
      });
      if (error) throw error;

      await recalcOrderTotal(orderId);
      return { title, total };
    },
    onSuccess: async (result) => {
      setLineTitle('');
      setLineQty('1');
      setLineUnitPrice('0');
      setLineVatRate('25');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-lines', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['order-project-orders', companyId, orderQuery.data?.project_id ?? 'none'] })
      ]);
      toast.success(`Orderrad tillagd: ${result.title}`);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Kunde inte lägga till orderrad'))
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

      await recalcOrderTotal(orderId);
      return { title: line.title };
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-lines', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['order-project-orders', companyId, orderQuery.data?.project_id ?? 'none'] })
      ]);
      toast.success(`Orderrad uppdaterad: ${result.title}`);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Kunde inte uppdatera orderrad'))
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (line: OrderLineRow) => {
      const { error } = await supabase
        .from('order_lines')
        .delete()
        .eq('company_id', companyId)
        .eq('id', line.id);
      if (error) throw error;

      await recalcOrderTotal(orderId);
      return line;
    },
    onSuccess: async (line) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-lines', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['order-project-orders', companyId, orderQuery.data?.project_id ?? 'none'] })
      ]);
      toast.success(`Orderrad borttagen: ${line.title}`);
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Kunde inte ta bort orderrad'))
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => createInvoiceFromOrder(orderId),
    onSuccess: async (result) => {
      toast.success(extractInvoiceSummary(result));
      await queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] });
      await queryClient.invalidateQueries({ queryKey: ['orders', companyId] });
      await queryClient.invalidateQueries({ queryKey: ['order-invoices', companyId, orderId] });
      await queryClient.invalidateQueries({ queryKey: ['order-invoice-source-line-links', companyId, orderId] });
      await queryClient.invalidateQueries({ queryKey: ['invoices', companyId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa faktura')
  });
  const partialInvoiceMutation = useMutation({
    mutationFn: async (invoiceTotal: number) => createPartialInvoiceFromOrder(orderId, invoiceTotal),
    onSuccess: async () => {
      toast.success('Delfaktura skapad');
      setPartialInvoiceDialogOpen(false);
      setPartialInvoiceAmount('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-invoice-source-links', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-invoice-source-line-links', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-invoices', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa delfaktura')
  });
  const partialInvoiceLinesMutation = useMutation({
    mutationFn: async (orderLineIds: string[]) => createPartialInvoiceFromOrderLines(orderId, orderLineIds),
    onSuccess: async () => {
      toast.success('Delfaktura skapad från valda orderrader');
      setPartialInvoiceDialogOpen(false);
      setSelectedPartialLineIds([]);
      setPartialInvoiceAmount('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-invoice-source-links', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-invoice-source-line-links', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['order-invoices', companyId, orderId] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['orders', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['projects', companyId] })
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Kunde inte skapa delfaktura från orderrader')
  });
  const updates = useMemo(() => {
    if (!orderQuery.data) return [];

    const order = orderQuery.data;
    const items = [
      {
        id: `order-${order.id}`,
        title: 'Order skapad',
        meta: `Status: ${orderStatusEtikett(order.status)}`,
        at: order.created_at
      },
      ...(linesQuery.data ?? []).map((line) => ({
        id: `line-${line.id}`,
        title: `Orderrad: ${line.title}`,
        meta: `${Number(line.qty).toFixed(2)} st • ${Number(line.total).toFixed(2)} kr`,
        at: line.created_at
      })),
      ...(invoicesQuery.data ?? []).map((inv) => ({
        id: `invoice-${inv.id}`,
        title: `${fakturaTypEtikett(inv.kind)} ${inv.invoice_no}`,
        meta: `${fakturaTypEtikett(inv.kind)} • ${fakturaStatusEtikett(inv.status)} • ${Number(inv.total).toFixed(2)} ${inv.currency}`,
        at: inv.created_at
      }))
    ];

    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [invoicesQuery.data, linesQuery.data, orderQuery.data]);

  const logs = useMemo(() => {
    if (!orderQuery.data) return [];

    const order = orderQuery.data;
    const entries = [
      {
        id: `log-order-${order.id}`,
        title: 'Order registrerad',
        detail: `Order-ID ${order.id}`,
        at: order.created_at
      },
      ...(linesQuery.data ?? []).map((line) => ({
        id: `log-line-${line.id}`,
        title: 'Orderrad registrerad',
        detail: `${line.title} • ${Number(line.total).toFixed(2)} kr`,
        at: line.created_at
      })),
      ...(invoicesQuery.data ?? []).map((invoice) => ({
        id: `log-invoice-${invoice.id}`,
        title: 'Fakturakoppling registrerad',
        detail: `${invoice.invoice_no} • ${fakturaTypEtikett(invoice.kind)} • ${fakturaStatusEtikett(invoice.status)}`,
        at: invoice.created_at
      }))
    ];

    return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [invoicesQuery.data, linesQuery.data, orderQuery.data]);

  const invoiceSourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of invoiceSourceCountsQuery.data ?? []) {
      counts.set(row.invoice_id, (counts.get(row.invoice_id) ?? 0) + 1);
    }
    return counts;
  }, [invoiceSourceCountsQuery.data]);

  if (orderQuery.isLoading) return <p>Laddar order...</p>;
  if (!orderQuery.data) return <p>Order hittades inte.</p>;

  const order = orderQuery.data;
  const statusValue = orderStatuses.includes(order.status as OrderStatus) ? (order.status as OrderStatus) : 'draft';
  const invoiceReadiness = resolveInvoiceReadinessStatus(order.invoice_readiness_status, order.status);
  const orderIsApprovedForInvoicing = invoiceReadiness === 'approved_for_invoicing';
  const invoiceReadinessOptions = getInvoiceReadinessOptions(role, invoiceReadiness);
  const invoiceAttachments = (invoicesQuery.data ?? []).filter((invoice) => Boolean(invoice.attachment_path));
  const members = membersQuery.data ?? [];
  const projectOrders = projectOrdersQuery.data ?? [];
  const parentOrder = projectOrders.find((item) => item.id === order.parent_order_id) ?? null;
  const childOrders = projectOrders.filter((item) => item.parent_order_id === order.id);
  const familyOrders = projectOrders.filter((item) => item.root_order_id === order.root_order_id);
  const orderFamilyRollup =
    (orderFamilyRollupsQuery.data ?? []).find((item) => item.root_order_id === order.root_order_id) ?? null;
  const creditedGrossTotalByInvoiceId = useMemo(() => {
    const totals = new Map<string, number>();

    for (const invoice of invoicesQuery.data ?? []) {
      if (invoice.kind !== 'credit_note' || invoice.status === 'void') continue;
      const total = asInvoiceLines(invoice.lines_snapshot).reduce((sum, line) => {
        if (String(line.order_id ?? '') !== orderId) return sum;
        return sum + Math.abs(getInvoiceLineGrossTotal(line));
      }, 0);

      if (total > 0) {
        totals.set(invoice.id, total);
      }
    }

    return totals;
  }, [invoicesQuery.data, orderId]);
  const allocatedInvoiceTotal =
    (invoiceSourceLinksQuery.data ?? []).length > 0
      ? (invoiceSourceLinksQuery.data ?? []).reduce((sum, source) => {
          const invoice = (invoicesQuery.data ?? []).find((item) => item.id === source.invoice_id);
          if (invoice?.status === 'void') return sum;
          return sum + Number(source.allocated_total ?? 0);
        }, 0)
      : (invoicesQuery.data ?? [])
          .filter((invoice) => invoice.status !== 'void' && invoice.kind !== 'credit_note')
          .reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const grossInvoicedTotal =
    (invoiceSourceLinksQuery.data ?? []).length > 0
      ? (invoiceSourceLinksQuery.data ?? []).reduce((sum, source) => {
          const invoice = (invoicesQuery.data ?? []).find((item) => item.id === source.invoice_id);
          if (!invoice || invoice.status === 'void' || invoice.kind === 'credit_note') return sum;
          return sum + Number(source.allocated_total ?? 0);
        }, 0)
      : (invoicesQuery.data ?? [])
          .filter((invoice) => invoice.status !== 'void' && invoice.kind !== 'credit_note' && invoice.order_id === orderId)
          .reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const creditedInvoiceTotal = Array.from(creditedGrossTotalByInvoiceId.values()).reduce((sum, total) => sum + total, 0);
  const netInvoicedTotal = grossInvoicedTotal - creditedInvoiceTotal;
  const orderGrossTotal = (linesQuery.data ?? []).reduce(
    (sum, line) => sum + Number(line.total ?? 0) * (1 + Number(line.vat_rate ?? 0) / 100),
    0
  );
  const invoiceProgress = resolveOrderInvoiceProgress(
    orderGrossTotal > 0 ? orderGrossTotal : Number(order.total ?? 0),
    allocatedInvoiceTotal
  );
  const allocatedInvoiceLineTotalByLineId = useMemo(() => {
    const map = (invoiceSourceLineLinksQuery.data ?? []).reduce((innerMap, row) => {
      const invoice = (invoicesQuery.data ?? []).find((item) => item.id === row.invoice_id);
      if (invoice?.status === 'void') return innerMap;
      innerMap.set(row.order_line_id, (innerMap.get(row.order_line_id) ?? 0) + Number(row.allocated_total ?? 0));
      return innerMap;
    }, new Map<string, number>());

    const knownOrderLineIds = new Set((linesQuery.data ?? []).map((line) => line.id));
    for (const invoice of invoicesQuery.data ?? []) {
      if (invoice.kind !== 'credit_note' || invoice.status === 'void') continue;
      for (const line of asInvoiceLines(invoice.lines_snapshot)) {
        const lineId = String(line.id ?? '');
        if (!knownOrderLineIds.has(lineId)) continue;
        map.set(lineId, (map.get(lineId) ?? 0) - Math.abs(getInvoiceLineGrossTotal(line)));
      }
    }

    return map;
  }, [invoiceSourceLineLinksQuery.data, invoicesQuery.data, linesQuery.data]);
  const partialInvoiceLineOptions = (linesQuery.data ?? []).map((line) => {
    const grossTotal = Number(line.total ?? 0) * (1 + Number(line.vat_rate ?? 0) / 100);
    const allocatedTotal = Number(allocatedInvoiceLineTotalByLineId.get(line.id) ?? 0);
    const remainingTotal = Math.max(grossTotal - allocatedTotal, 0);
    return {
      ...line,
      grossTotal,
      allocatedTotal,
      remainingTotal
    };
  });
  const filteredOrderLineOptions = partialInvoiceLineOptions.filter((line) => {
    if (orderLineFilter === 'not_invoiced') return line.allocatedTotal <= 0;
    if (orderLineFilter === 'partially_invoiced') return line.allocatedTotal > 0 && line.remainingTotal > 0;
    if (orderLineFilter === 'fully_invoiced') return line.remainingTotal <= 0;
    return true;
  });
  const resolvedPartialInvoiceAmount =
    partialInvoiceMode === 'quarter'
      ? invoiceProgress.remaining * 0.25
      : partialInvoiceMode === 'half'
        ? invoiceProgress.remaining * 0.5
        : partialInvoiceMode === 'remaining'
          ? invoiceProgress.remaining
          : Number(partialInvoiceAmount);
  const normalizedPartialInvoiceAmount = Number.isFinite(resolvedPartialInvoiceAmount)
    ? Math.round(resolvedPartialInvoiceAmount * 100) / 100
    : Number.NaN;
  const selectedPartialLinesTotal = partialInvoiceLineOptions
    .filter((line) => selectedPartialLineIds.includes(line.id))
    .reduce((sum, line) => sum + line.remainingTotal, 0);
  const outstandingInvoiceValue = (invoicesQuery.data ?? [])
    .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void')
    .reduce((sum, invoice) => {
      if (invoice.kind === 'credit_note') {
        return sum - Number(creditedGrossTotalByInvoiceId.get(invoice.id) ?? 0);
      }
      const allocatedTotal =
        Number((invoiceSourceLinksQuery.data ?? []).find((row) => row.invoice_id === invoice.id)?.allocated_total ?? Number.NaN);
      return sum + (Number.isFinite(allocatedTotal) ? allocatedTotal : Number(invoice.total ?? 0));
    }, 0);
  const latestInvoice = invoicesQuery.data?.[0] ?? null;
  const hasActiveInvoice = (invoicesQuery.data ?? []).some((invoice) => invoice.status !== 'void');
  const readinessChecklist = buildOrderInvoiceReadinessChecklist({
    customerName: customerQuery.data?.name,
    projectTitle: projectQuery.data?.title,
    lineCount: linesQuery.data?.length ?? 0,
    orderTotal: Number(order.total ?? 0)
  });

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="icon" aria-label="Tillbaka till ordrar">
                <Link href="/orders">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">Order</p>
                <CardTitle className="text-lg">{order.order_no ?? order.id}</CardTitle>
                <p className="mt-0.5 text-[11px] text-foreground/60">{projectQuery.data?.title ?? order.project_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label={`Status: ${orderStatusEtikett(order.status)}`}
                title={orderStatusEtikett(order.status)}
              >
                <ShieldCheck className={`h-4 w-4 ${orderStatusIconClass(order.status)}`} />
              </Button>
              <Button asChild variant="outline" size="icon" aria-label="Öppna projekt">
                <Link href={`/projects/${order.project_id}`}>
                  <FolderOpen className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              <CircleDollarSign className="h-3 w-3" />
              {Number(order.total).toFixed(2)} kr
            </Badge>
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              {orderKindLabel(order.order_kind)}
            </Badge>
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              {getOrderInvoiceProgressLabel(invoiceProgress.status)}
            </Badge>
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">{getInvoiceReadinessLabel(invoiceReadiness)}</Badge>
            <Badge className="gap-1.5 px-2 py-1 text-[11px]">
              <CalendarDays className="h-3 w-3" />
              {new Date(order.created_at).toLocaleDateString('sv-SE')}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div ref={containerRef} className="-mx-4 flex overflow-x-auto border-b border-border/70 px-4">
        {orderTabs.map((tab) => (
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
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4" {...swipeHandlers}>
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="text-sm text-foreground/70">Projekt</p>
                  <p className="mt-1 font-medium">{projectQuery.data?.title ?? order.project_id}</p>
                </div>
                <div className="border-t border-border/70 pt-3">
                  <p className="text-sm text-foreground/70">Kund</p>
                  <p className="mt-1 font-medium">{customerQuery.data?.name ?? 'Ingen kund kopplad'}</p>
                </div>
                <div className="border-t border-border/70 pt-3">
                  <p className="text-sm text-foreground/70">Struktur</p>
                  <p className="mt-1 font-medium">{orderKindLabel(order.order_kind)}</p>
                  <p className="mt-1 text-xs text-foreground/60">
                    {parentOrder
                      ? `Under ${parentOrder.order_no ?? parentOrder.id}`
                      : childOrders.length > 0
                        ? `${childOrders.length} underordnade ordrar`
                        : 'Ingen överordnad order'}
                  </p>
                  <p className="mt-2 text-xs text-foreground/60">{orderKindPurposeText(order.order_kind)}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="rounded-xl border border-border/70 bg-primary/5 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Faktureringsläge</p>
                  <p className="mt-1 font-medium">{getInvoiceReadinessLabel(invoiceReadiness)}</p>
                  <p className="mt-1 text-sm text-foreground/65">{getInvoiceReadinessDescription(invoiceReadiness)}</p>
                  <p className="mt-1 text-xs text-foreground/55">Ägare nu: {getInvoiceReadinessOwner(invoiceReadiness)} • Nästa steg: {getInvoiceReadinessNextStep(invoiceReadiness)}</p>
                  {role !== 'auditor' ? (
                    <div className="mt-3">
                      <SimpleSelect
                        value={invoiceReadiness}
                        onValueChange={(value) => updateInvoiceReadinessMutation.mutate(value as InvoiceReadinessStatus)}
                        disabled={updateInvoiceReadinessMutation.isPending}
                        options={invoiceReadinessOptions}
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 border-t border-border/60 pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Det här saknas innan nästa steg</p>
                    <ReadinessChecklist items={readinessChecklist} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm text-foreground/70">Orderrader</p>
                    <p className="mt-1 font-medium">{linesQuery.data?.length ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-foreground/70">Faktureringsstatus</p>
                    <p className="mt-1 font-medium">{getOrderInvoiceProgressLabel(invoiceProgress.status)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Orderstruktur</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Nuvarande order</p>
                <p className="mt-1 font-medium">{orderKindLabel(order.order_kind)}</p>
                <p className="mt-1 text-sm text-foreground/65">{order.order_no ?? order.id}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Relation</p>
                {parentOrder ? (
                  <div className="mt-1 space-y-2">
                    <p className="text-sm text-foreground/65">Kopplad under överordnad order</p>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/orders/${parentOrder.id}`}>Öppna överordnad order</Link>
                    </Button>
                  </div>
                ) : childOrders.length > 0 ? (
                  <div className="mt-1 space-y-2">
                    <p className="text-sm text-foreground/65">{childOrders.length} underordnade ordrar kopplade</p>
                    <div className="flex flex-wrap gap-2">
                      {childOrders.map((item) => (
                        <Button key={item.id} asChild size="sm" variant="ghost">
                          <Link href={`/orders/${item.id}`}>{item.order_no ?? item.id}</Link>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-foreground/65">Ingen hierarkikoppling ännu.</p>
                )}
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/15 p-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Orderfamilj</p>
                {orderFamilyRollup ? (
                  <div className="mt-1 space-y-1 text-sm text-foreground/70">
                    <p><span className="font-medium text-foreground">{Number(orderFamilyRollup.order_count ?? 0)}</span> ordrar i samma struktur</p>
                    <p><span className="font-medium text-foreground">{Number(orderFamilyRollup.total_order_value ?? 0).toFixed(2)} kr</span> totalt ordervärde</p>
                    <p><span className="font-medium text-foreground">{Number(orderFamilyRollup.net_invoiced_total ?? 0).toFixed(2)} kr</span> nettofakturerat</p>
                    <p><span className="font-medium text-foreground">{Number(orderFamilyRollup.remaining_total ?? 0).toFixed(2)} kr</span> kvar att fakturera</p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-foreground/65">Ingen familjesummering tillgänglig ännu.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {familyOrders.length > 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Ordrar i samma struktur</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {familyOrders.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/15 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.order_no ?? item.id}</p>
                      <p className="text-xs text-foreground/60">
                        {orderKindLabel(item.order_kind)} • {Number(item.total ?? 0).toFixed(2)} kr
                        {item.parent_order_id ? ' • under huvudorder' : ' • huvudorder'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.id === order.id ? <Badge>Aktuell</Badge> : null}
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/orders/${item.id}`}>Öppna</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Orderrader</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Lägg till orderrad</p>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                  <p className="text-foreground/70">
                    Förslag för {orderKindLabel(order.order_kind).toLowerCase()}:
                    <span className="font-medium text-foreground"> {orderKindSuggestedLineTitle(order.order_kind)}</span>
                  </p>
                  {!lineTitle.trim() ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setLineTitle(orderKindSuggestedLineTitle(order.order_kind))}
                      disabled={!canManageOrder(role)}
                    >
                      Använd standardtitel
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-2 md:grid-cols-5">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Titel</span>
                    <Input
                      value={lineTitle}
                      onChange={(e) => setLineTitle(e.target.value)}
                      placeholder={orderKindSuggestedLineTitle(order.order_kind)}
                      disabled={!canManageOrder(role)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Antal</span>
                    <Input value={lineQty} onChange={(e) => setLineQty(e.target.value)} type="number" min="0" step="0.01" placeholder="1" disabled={!canManageOrder(role)} />
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
                      disabled={!canManageOrder(role)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/55">Moms %</span>
                    <Input value={lineVatRate} onChange={(e) => setLineVatRate(e.target.value)} type="number" min="0" step="0.01" placeholder="25" disabled={!canManageOrder(role)} />
                  </label>
                </div>
                <Button className="mt-2" onClick={() => addLineMutation.mutate()} disabled={addLineMutation.isPending || !canManageOrder(role)}>
                  {addLineMutation.isPending ? 'Lägger till...' : 'Lägg till rad'}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={orderLineFilter === 'all' ? 'default' : 'outline'} onClick={() => setOrderLineFilter('all')}>
                  Alla
                </Button>
                <Button type="button" size="sm" variant={orderLineFilter === 'not_invoiced' ? 'default' : 'outline'} onClick={() => setOrderLineFilter('not_invoiced')}>
                  Ej fakturerade
                </Button>
                <Button type="button" size="sm" variant={orderLineFilter === 'partially_invoiced' ? 'default' : 'outline'} onClick={() => setOrderLineFilter('partially_invoiced')}>
                  Delfakturerade
                </Button>
                <Button type="button" size="sm" variant={orderLineFilter === 'fully_invoiced' ? 'default' : 'outline'} onClick={() => setOrderLineFilter('fully_invoiced')}>
                  Slutfakturerade
                </Button>
              </div>
              <div className="space-y-3 md:hidden">
                {filteredOrderLineOptions.length === 0 && (
                  <p className="text-sm text-foreground/70">Inga rader ännu.</p>
                )}
                {filteredOrderLineOptions.map((line) => (
                  <div key={line.id} className="rounded-xl border border-border/80 bg-card p-3">
                    {(() => {
                      const grossTotal = line.grossTotal;
                      const invoicedTotal = line.allocatedTotal;
                      const remainingTotal = line.remainingTotal;
                      return (
                        <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-snug">{line.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge>{getOrderLineInvoiceStatusLabel(invoicedTotal, grossTotal)}</Badge>
                          <span className="text-xs text-foreground/60">
                            Fakturerat {invoicedTotal.toFixed(2)} kr • Kvar {remainingTotal.toFixed(2)} kr
                          </span>
                        </div>
                      </div>
                      <div className="shrink-0 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-right">
                        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-primary/80">Radtotal</p>
                        <p className="mt-1 text-sm font-semibold text-primary">{grossTotal.toFixed(2)} kr</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Antal</p>
                        <p className="mt-1 text-sm font-medium">{Number(line.qty).toFixed(2)}</p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">A-pris</p>
                        <p className="mt-1 text-sm font-medium">{Number(line.unit_price).toFixed(2)} kr</p>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Moms</p>
                        <p className="mt-1 text-sm font-medium">{Number(line.vat_rate).toFixed(2)}%</p>
                      </div>
                    </div>
                    {canManageOrder(role) ? (
                      <div className="mt-3 flex gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => setMobileEditTarget(line)}>
                          Redigera
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteTarget(line)}>
                          Ta bort
                        </Button>
                      </div>
                    ) : null}
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
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
                  {filteredOrderLineOptions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-foreground/70">
                        Inga rader ännu.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredOrderLineOptions.map((line) => (
                    <EditableLineRow
                      key={line.id}
                      line={line}
                      invoicedTotal={Number(allocatedInvoiceLineTotalByLineId.get(line.id) ?? 0)}
                      saving={updateLineMutation.isPending || deleteLineMutation.isPending}
                      canEdit={canManageOrder(role)}
                      onSave={(nextLine) => updateLineMutation.mutate(nextLine)}
                      onDelete={() => setDeleteTarget(line)}
                    />
                  ))}
                </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'updates' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Uppdateringar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Senaste uppdatering</p>
                <p className="mt-1 font-medium">{updates[0] ? new Date(updates[0].at).toLocaleString('sv-SE') : '-'}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Orderrader</p>
                <p className="mt-1 font-medium">{linesQuery.data?.length ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Fakturahändelser</p>
                <p className="mt-1 font-medium">{invoicesQuery.data?.length ?? 0}</p>
              </div>
            </div>
            {updates.length === 0 && <p className="text-sm text-foreground/70">Inga uppdateringar ännu.</p>}
            {updates.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-foreground/60">{new Date(item.at).toLocaleString('sv-SE')}</p>
                </div>
                <p className="mt-1 text-sm text-foreground/70">{item.meta}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === 'economy' && (
        <div className="space-y-4" {...swipeHandlers}>
          <Card>
            <CardHeader>
              <CardTitle>Ekonomi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RoleGate role={role} allow={['finance', 'admin']}>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-56">
                    <Select value={statusValue} onValueChange={(value) => updateStatusMutation.mutate(value as OrderStatus)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {orderStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => invoiceMutation.mutate()}
                    disabled={invoiceMutation.isPending || !canManageOrder(role) || hasActiveInvoice || !orderIsApprovedForInvoicing}
                  >
                    {invoiceMutation.isPending ? 'Skapar...' : hasActiveInvoice ? 'Faktura finns redan' : !orderIsApprovedForInvoicing ? 'Fastställ först' : 'Skapa faktura'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPartialInvoiceMethod('amount');
                      setPartialInvoiceMode('remaining');
                      setPartialInvoiceAmount(invoiceProgress.remaining.toFixed(2));
                      setSelectedPartialLineIds([]);
                      setPartialInvoiceDialogOpen(true);
                    }}
                    disabled={
                      partialInvoiceMutation.isPending ||
                      partialInvoiceLinesMutation.isPending ||
                      !canManageOrder(role) ||
                      invoiceProgress.remaining <= 0 ||
                      !orderIsApprovedForInvoicing
                    }
                  >
                    {partialInvoiceMutation.isPending || partialInvoiceLinesMutation.isPending ? 'Skapar delfaktura...' : !orderIsApprovedForInvoicing ? 'Fastställ först' : 'Skapa delfaktura'}
                  </Button>
                </div>
              </RoleGate>

              <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">Faktureringsläge</p>
                    <p className="font-medium">{getInvoiceReadinessLabel(invoiceReadiness)}</p>
                    <p className="text-sm text-foreground/65">{getInvoiceReadinessDescription(invoiceReadiness)}</p>
                    <p className="text-xs text-foreground/55">Ägare nu: {getInvoiceReadinessOwner(invoiceReadiness)} • Nästa steg: {getInvoiceReadinessNextStep(invoiceReadiness)}</p>
                  </div>
                  {role !== 'auditor' ? (
                    <div className="w-full sm:w-64">
                      <SimpleSelect
                        value={invoiceReadiness}
                        onValueChange={(value) => updateInvoiceReadinessMutation.mutate(value as InvoiceReadinessStatus)}
                        disabled={updateInvoiceReadinessMutation.isPending}
                        options={invoiceReadinessOptions}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 border-t border-border/60 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">Det här saknas innan nästa steg</p>
                  <ReadinessChecklist items={readinessChecklist} />
                  {!orderIsApprovedForInvoicing ? (
                    <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                      Kundfaktura och delfaktura kräver att ordern först markeras som fastställd för fakturering.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Ordertotal</p>
                  <p className="mt-1 font-medium">{Number(order.total).toFixed(2)} kr</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Faktureringsstatus</p>
                  <p className="mt-1 font-medium">{getOrderInvoiceProgressLabel(invoiceProgress.status)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Status</p>
                  <p className="mt-1 font-medium">{orderStatusEtikett(order.status)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Öppet fakturavärde</p>
                  <p className="mt-1 font-medium">{outstandingInvoiceValue.toFixed(2)} kr</p>
                  <p className="mt-1 text-xs text-foreground/55">
                    Tar hänsyn till öppna kreditnotor och visar nettot av ej slutreglerade fakturor.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Bruttofakturerat</p>
                  <p className="mt-1 font-medium">{grossInvoicedTotal.toFixed(2)} kr</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Krediterat</p>
                  <p className="mt-1 font-medium">{creditedInvoiceTotal.toFixed(2)} kr</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Nettofakturerat</p>
                  <p className="mt-1 font-medium">{netInvoicedTotal.toFixed(2)} kr</p>
                  <p className="mt-1 text-xs text-foreground/55">
                    Separeras från orderns faktureringsprogress så att senare krediteringar syns tydligt.
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Senaste faktura</p>
                  <p className="mt-1 font-medium">{latestInvoice?.invoice_no ?? 'Ingen ännu'}</p>
                  <p className="mt-1 text-xs text-foreground/55">
                    {latestInvoice?.created_at ? new Date(latestInvoice.created_at).toLocaleDateString('sv-SE') : 'Skapa faktura när ordern är klar'}
                  </p>
                  {latestInvoice && (invoiceSourceCounts.get(latestInvoice.id) ?? 0) > 1 ? (
                    <p className="mt-1 text-xs text-primary">Ingår i samlingsfaktura</p>
                  ) : null}
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-sm text-foreground/70">Kvar att fakturera</p>
                  <p className="mt-1 font-medium">
                    {invoiceProgress.remaining.toFixed(2)} kr
                  </p>
                  <p className="mt-1 text-xs text-foreground/55">
                    {invoiceProgress.status === 'fully_invoiced' ? 'Ordern är fullt omsatt i fakturor.' : 'Visas korrekt även när ordern ingår i samlingsfaktura.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fakturor för ordern</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(invoicesQuery.data ?? []).length === 0 && <p className="text-sm text-foreground/70">Inga fakturor ännu.</p>}
                {(invoicesQuery.data ?? []).map((inv) => (
                  <div key={inv.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{inv.invoice_no}</p>
                        {(invoiceSourceCounts.get(inv.id) ?? 0) > 1 ? <Badge>Samlingsfaktura</Badge> : null}
                        {inv.kind === 'credit_note' ? (
                          <Badge className="border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-200">Kreditfaktura</Badge>
                        ) : null}
                      </div>
                      <Badge>{fakturaStatusEtikett(inv.status)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-foreground/70">
                      {new Date(inv.created_at).toLocaleString('sv-SE')} • {fakturaTypEtikett(inv.kind)} • {Number(inv.total).toFixed(2)} {inv.currency}
                    </p>
                    <p className="mt-1 text-xs text-foreground/55">
                      {inv.kind === 'credit_note' ? 'Krediterat på denna order' : 'Andel för denna order'}:{' '}
                      {Number(
                        inv.kind === 'credit_note'
                          ? creditedGrossTotalByInvoiceId.get(inv.id) ?? 0
                          : (invoiceSourceLinksQuery.data ?? []).find((row) => row.invoice_id === inv.id)?.allocated_total ?? inv.total ?? 0
                      ).toFixed(2)}{' '}
                      {inv.currency}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/invoices/${inv.id}`}>Öppna faktura</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/api/invoices/${inv.id}/export?compact=1`}>Exportera JSON</Link>
                      </Button>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'attachments' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Bilagor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Bilagor på fakturor</p>
                <p className="mt-1 font-medium">{invoiceAttachments.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Fakturor med underlag</p>
                <p className="mt-1 font-medium">
                  {new Set(invoiceAttachments.map((invoice) => invoice.id)).size}
                </p>
              </div>
            </div>

            {invoiceAttachments.length === 0 ? (
              <p className="text-sm text-foreground/70">
                Inga bilagor hittades på orderns fakturor ännu. Lägg bilagor på fakturan eller projektet tills vidare.
              </p>
            ) : (
              <div className="space-y-3">
                {invoiceAttachments.map((invoice) => (
                  <div key={invoice.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Paperclip className="h-4 w-4 text-foreground/55" />
                          <p className="font-medium">{invoice.invoice_no}</p>
                        </div>
                        <p className="mt-1 text-sm text-foreground/70">
                          {fakturaStatusEtikett(invoice.status)} • {Number(invoice.total).toFixed(2)} {invoice.currency}
                        </p>
                        <p className="mt-1 text-xs text-foreground/55">
                          {invoice.due_date ? `Förfallo ${new Date(invoice.due_date).toLocaleDateString('sv-SE')}` : 'Förfallodatum saknas'}
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/invoices/${invoice.id}`}>Öppna faktura</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'members' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Medlemmar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {members.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-3">
                <div>
                  <p className="text-sm font-medium">Tilldelade medlemmar</p>
                  <p className="text-sm text-foreground/65">Ordern använder samma team som projektet.</p>
                </div>
                <div className="space-y-3">
                  {members.map((member) => {
                    const memberLabel = getUserDisplayName({
                      displayName: member.display_name,
                      email: member.email,
                      userId: member.user_id
                    });

                    return (
                      <div key={member.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-foreground/55" />
                            <p className="truncate text-sm font-medium">{memberLabel}</p>
                          </div>
                          {member.email && member.email !== memberLabel ? <p className="mt-1 text-xs text-foreground/55">{member.email}</p> : null}
                          <p className="mt-1 text-xs text-foreground/55">
                            Tillagd {new Date(member.created_at).toLocaleDateString('sv-SE')}
                          </p>
                        </div>
                        <Badge>{roleLabel(member.role)}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground/70">
                Inga tilldelade medlemmar hittades på projektet ännu.
              </p>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Ordermodell</p>
                <p className="mt-1 font-medium">Ärver projektets team</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Tilldelade medlemmar</p>
                <p className="mt-1 font-medium">{members.length}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-sm text-foreground/70">Projekt</p>
                <p className="mt-1 font-medium">{projectQuery.data?.title ?? '-'}</p>
              </div>
            </div>

            <p className="text-sm text-foreground/70">
              Ordern använder projektets team. Öppna projektet för att se eller hantera medlemmar.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/projects/${order.project_id}`}>Visa projektmedlemmar</Link>
              </Button>
              {customerQuery.data ? (
                <Button asChild variant="ghost">
                  <Link href={`/customers/${customerQuery.data.id}` as Route}>Öppna kund</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'logs' && (
        <Card {...swipeHandlers}>
          <CardHeader>
            <CardTitle>Loggar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Order-ID</p>
              <p className="mt-1 break-all font-mono text-foreground/70">{order.id}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Projekt-ID</p>
              <p className="mt-1 break-all font-mono text-foreground/70">{order.project_id}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Systemstatus</p>
              <p className="mt-1 text-foreground/70">{order.status}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Faktureringsläge</p>
              <p className="mt-1 text-foreground/70">{getInvoiceReadinessLabel(invoiceReadiness)}</p>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Skapad</p>
              <p className="mt-1 text-foreground/70">{new Date(order.created_at).toLocaleString('sv-SE')}</p>
            </div>
            <div className="space-y-3 pt-1">
              <p className="text-sm font-medium text-foreground/80">Händelselogg</p>
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{log.title}</p>
                    <p className="text-xs text-foreground/55">{new Date(log.at).toLocaleString('sv-SE')}</p>
                  </div>
                  <p className="mt-1 text-foreground/70">{log.detail}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(mobileEditTarget)} onOpenChange={(open) => !open && setMobileEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera orderrad</DialogTitle>
            <DialogDescription>Uppdatera titel, antal, a-pris och moms för den valda raden.</DialogDescription>
          </DialogHeader>
          {mobileEditTarget ? (
            <div className="space-y-4">
              <label className="space-y-1">
                <span className="text-sm">Titel</span>
                <Input
                  value={mobileEditTarget.title}
                  onChange={(e) => setMobileEditTarget((current) => (current ? { ...current, title: e.target.value } : current))}
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-sm">Antal</span>
                  <Input
                    value={String(mobileEditTarget.qty)}
                    onChange={(e) =>
                      setMobileEditTarget((current) => (current ? { ...current, qty: toNumber(e.target.value) } : current))
                    }
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm">A-pris</span>
                  <Input
                    value={String(mobileEditTarget.unit_price)}
                    onChange={(e) =>
                      setMobileEditTarget((current) => (current ? { ...current, unit_price: toNumber(e.target.value) } : current))
                    }
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm">Moms %</span>
                  <Input
                    value={String(mobileEditTarget.vat_rate)}
                    onChange={(e) =>
                      setMobileEditTarget((current) => (current ? { ...current, vat_rate: toNumber(e.target.value) } : current))
                    }
                    type="number"
                    min="0"
                    step="0.01"
                  />
                </label>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-foreground/70">
                Nytt radtotal inkl moms:{' '}
                {(computeLineTotal(Number(mobileEditTarget.qty), Number(mobileEditTarget.unit_price)) * (1 + Number(mobileEditTarget.vat_rate) / 100)).toFixed(2)} kr
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMobileEditTarget(null)}>
                  Avbryt
                </Button>
                <Button
                  onClick={() => {
                    if (!mobileEditTarget) return;
                    updateLineMutation.mutate(mobileEditTarget);
                    setMobileEditTarget(null);
                  }}
                  disabled={updateLineMutation.isPending}
                >
                  {updateLineMutation.isPending ? 'Sparar...' : 'Spara'}
                </Button>
              </div>
            </div>
          ) : null}
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
          <div className="flex justify-end gap-2">
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
              disabled={deleteLineMutation.isPending}
            >
              {deleteLineMutation.isPending ? 'Tar bort...' : 'Ta bort'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ActionSheet
        open={partialInvoiceDialogOpen}
        onClose={() => setPartialInvoiceDialogOpen(false)}
        title="Skapa delfaktura"
        description={`Välj om delfakturan ska baseras på belopp eller specifika orderrader. Kvar att fakturera: ${invoiceProgress.remaining.toFixed(2)} kr.`}
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm">Metod</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={partialInvoiceMethod === 'amount' ? 'default' : 'outline'} onClick={() => setPartialInvoiceMethod('amount')}>
                  Belopp
                </Button>
                <Button type="button" variant={partialInvoiceMethod === 'lines' ? 'default' : 'outline'} onClick={() => setPartialInvoiceMethod('lines')}>
                  Orderrader
                </Button>
              </div>
            </div>
            {partialInvoiceMethod === 'amount' ? (
              <>
            <div className="space-y-2">
              <p className="text-sm">Snabbval</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={partialInvoiceMode === 'quarter' ? 'default' : 'outline'} onClick={() => setPartialInvoiceMode('quarter')}>
                  25% av kvar
                </Button>
                <Button type="button" variant={partialInvoiceMode === 'half' ? 'default' : 'outline'} onClick={() => setPartialInvoiceMode('half')}>
                  50% av kvar
                </Button>
                <Button type="button" variant={partialInvoiceMode === 'remaining' ? 'default' : 'outline'} onClick={() => setPartialInvoiceMode('remaining')}>
                  Restbelopp
                </Button>
                <Button type="button" variant={partialInvoiceMode === 'custom' ? 'default' : 'outline'} onClick={() => setPartialInvoiceMode('custom')}>
                  Egen summa
                </Button>
              </div>
            </div>
            <label className="space-y-1">
              <span className="text-sm">Belopp inkl moms</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={partialInvoiceAmount}
                onChange={(event) => {
                  setPartialInvoiceMode('custom');
                  setPartialInvoiceAmount(event.target.value);
                }}
                disabled={partialInvoiceMode !== 'custom'}
              />
            </label>
            <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-foreground/70">
              Faktureras nu: {Number.isFinite(normalizedPartialInvoiceAmount) ? normalizedPartialInvoiceAmount.toFixed(2) : '0.00'} kr inkl moms
            </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-foreground/70">
                  Välj en eller flera orderrader. Varje vald rad faktureras med sitt återstående belopp.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedPartialLineIds(partialInvoiceLineOptions.filter((line) => line.allocatedTotal <= 0 && line.remainingTotal > 0).map((line) => line.id))}
                  >
                    Markera alla ej fakturerade
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setSelectedPartialLineIds([])}>
                    Rensa val
                  </Button>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {partialInvoiceLineOptions.map((line) => {
                    const isSelected = selectedPartialLineIds.includes(line.id);
                    const isDisabled = line.remainingTotal <= 0;
                    return (
                      <button
                        key={line.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() =>
                          setSelectedPartialLineIds((current) =>
                            current.includes(line.id) ? current.filter((id) => id !== line.id) : [...current, line.id]
                          )
                        }
                        className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                          isDisabled
                            ? 'cursor-not-allowed border-border/60 bg-muted/10 text-foreground/40'
                            : isSelected
                              ? 'border-primary bg-primary/10'
                              : 'border-border/70 bg-card hover:bg-muted/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{line.title}</p>
                            <p className="mt-1 text-xs text-foreground/60">
                              {Number(line.qty).toFixed(2)} st • {Number(line.unit_price).toFixed(2)} kr • Moms {Number(line.vat_rate).toFixed(2)}%
                            </p>
                          </div>
                          <div className="text-right text-xs">
                            <p>Totalt: {line.grossTotal.toFixed(2)} kr</p>
                            <p>Fakturerat: {line.allocatedTotal.toFixed(2)} kr</p>
                            <p className="font-medium">Kvar: {line.remainingTotal.toFixed(2)} kr</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm text-foreground/70">
                  Valda rader: {selectedPartialLineIds.length} • Faktureras nu: {selectedPartialLinesTotal.toFixed(2)} kr inkl moms
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPartialInvoiceDialogOpen(false)}>
                Avbryt
              </Button>
              {partialInvoiceMethod === 'amount' ? (
                <Button
                  onClick={() => partialInvoiceMutation.mutate(normalizedPartialInvoiceAmount)}
                  disabled={
                    partialInvoiceMutation.isPending ||
                    partialInvoiceLinesMutation.isPending ||
                    !Number.isFinite(normalizedPartialInvoiceAmount) ||
                    normalizedPartialInvoiceAmount <= 0 ||
                    normalizedPartialInvoiceAmount > invoiceProgress.remaining
                  }
                >
                  {partialInvoiceMutation.isPending ? 'Skapar...' : 'Skapa delfaktura'}
                </Button>
              ) : (
                <Button
                  onClick={() => partialInvoiceLinesMutation.mutate(selectedPartialLineIds)}
                  disabled={
                    partialInvoiceLinesMutation.isPending ||
                    partialInvoiceMutation.isPending ||
                    selectedPartialLineIds.length === 0 ||
                    selectedPartialLinesTotal <= 0
                  }
                >
                  {partialInvoiceLinesMutation.isPending ? 'Skapar...' : 'Skapa delfaktura från rader'}
                </Button>
              )}
            </div>
          </div>
      </ActionSheet>
    </section>
  );
}

function EditableLineRow({
  line,
  invoicedTotal,
  saving,
  canEdit,
  onSave,
  onDelete
}: {
  line: OrderLineRow;
  invoicedTotal: number;
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
        <div className="space-y-2">
          <Input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} disabled={!canEdit} />
          <div className="flex flex-wrap items-center gap-2">
            <Badge>
              {getOrderLineInvoiceStatusLabel(
                invoicedTotal,
                computeLineTotal(Number(draft.qty), Number(draft.unit_price)) * (1 + Number(draft.vat_rate) / 100)
              )}
            </Badge>
            <span className="text-xs text-foreground/60">
              Fakturerat {invoicedTotal.toFixed(2)} kr • Kvar{' '}
              {Math.max(
                computeLineTotal(Number(draft.qty), Number(draft.unit_price)) * (1 + Number(draft.vat_rate) / 100) - invoicedTotal,
                0
              ).toFixed(2)} kr
            </span>
          </div>
        </div>
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
      <TableCell>{(computeLineTotal(Number(draft.qty), Number(draft.unit_price)) * (1 + Number(draft.vat_rate) / 100)).toFixed(2)}</TableCell>
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
