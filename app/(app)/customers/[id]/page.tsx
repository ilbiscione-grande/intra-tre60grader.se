'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowLeft, Building2, CircleDollarSign, FolderKanban, Mail, MapPin, Phone, ReceiptText, ScrollText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { createInvoiceFromOrders } from '@/lib/rpc';

type Customer = {
  id: string;
  name: string;
  archived_at: string | null;
  org_no: string | null;
  vat_no: string | null;
  billing_email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
};

type ProjectSummary = {
  id: string;
  title: string;
  status: string;
  created_at: string;
};

type OrderSummary = {
  id: string;
  order_no: string | null;
  project_id: string;
  status: string;
  total: number;
  created_at: string;
};

type InvoiceSummary = {
  id: string;
  invoice_no: string;
  project_id: string;
  status: string;
  total: number;
  currency: string;
  due_date: string;
  created_at: string;
};

type CustomerActivityItem = {
  id: string;
  title: string;
  detail: string;
  at: string;
  href: Route;
};

function projectStatusLabel(status: string) {
  const map: Record<string, string> = {
    todo: 'Att göra',
    in_progress: 'Pågående',
    review: 'Granskning',
    done: 'Klart'
  };
  return map[status] ?? status;
}

function orderStatusLabel(status: string) {
  const map: Record<string, string> = {
    draft: 'Utkast',
    sent: 'Skickad',
    paid: 'Betald',
    cancelled: 'Avbruten',
    invoiced: 'Fakturerad'
  };
  return map[status] ?? status;
}

function invoiceStatusLabel(status: string) {
  const map: Record<string, string> = {
    draft: 'Utkast',
    issued: 'Skapad',
    sent: 'Skickad',
    paid: 'Betald',
    overdue: 'Förfallen',
    cancelled: 'Avbruten'
  };
  return map[status] ?? status;
}

export default function CustomerDetailsPage() {
  const { companyId, role } = useAppContext();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params.id;
  const supabase = createClient();
  const [combinedInvoiceOpen, setCombinedInvoiceOpen] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  const query = useQuery<Customer | null>({
    queryKey: ['customer', companyId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id,name,archived_at,org_no,vat_no,billing_email,phone,address_line1,address_line2,postal_code,city,country')
        .eq('company_id', companyId)
        .eq('id', customerId)
        .maybeSingle<Customer>();

      if (error) throw error;
      return data;
    }
  });

  const projectsQuery = useQuery<ProjectSummary[]>({
    queryKey: ['customer-projects', companyId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,status,created_at')
        .eq('company_id', companyId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .returns<ProjectSummary[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const ordersQuery = useQuery<OrderSummary[]>({
    queryKey: ['customer-orders', companyId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id,order_no,project_id,status,total,created_at')
        .eq('company_id', companyId)
        .in('project_id', (projectsQuery.data ?? []).map((project) => project.id))
        .order('created_at', { ascending: false })
        .returns<OrderSummary[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: (projectsQuery.data?.length ?? 0) > 0
  });

  const invoicesQuery = useQuery<InvoiceSummary[]>({
    queryKey: ['customer-invoices', companyId, customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,project_id,status,total,currency,due_date,created_at')
        .eq('company_id', companyId)
        .in('project_id', (projectsQuery.data ?? []).map((project) => project.id))
        .order('created_at', { ascending: false })
        .returns<InvoiceSummary[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: (projectsQuery.data?.length ?? 0) > 0
  });

  const createCombinedInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (selectedOrderIds.length === 0) {
        throw new Error('Välj minst en order');
      }

      return createInvoiceFromOrders(selectedOrderIds);
    },
    onSuccess: (result) => {
      const response = (result ?? {}) as {
        invoice_id?: string;
        invoice_no?: string;
      };

      if (!response.invoice_id) {
        throw new Error('Fakturan skapades men inget invoice_id returnerades');
      }

      toast.success(response.invoice_no ? `Samlingsfaktura skapad: ${response.invoice_no}` : 'Samlingsfaktura skapad');
      setCombinedInvoiceOpen(false);
      setSelectedOrderIds([]);
      router.push(`/invoices/${response.invoice_id}` as Route);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa samlingsfaktura');
    }
  });

  if (query.isLoading) return <p>Laddar kund...</p>;
  if (!query.data) return <p>Kunden hittades inte.</p>;

  const customer = query.data;
  const projects = projectsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const projectTitleById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.title])),
    [projects]
  );
  const selectableOrders = orders.filter((order) => !['paid', 'cancelled', 'invoiced'].includes(order.status) && Number(order.total ?? 0) > 0);
  const selectedOrders = selectableOrders.filter((order) => selectedOrderIds.includes(order.id));
  const selectedProjectCount = new Set(selectedOrders.map((order) => order.project_id)).size;
  const selectedTotal = selectedOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const billingAddress = [customer.address_line1, customer.address_line2, customer.postal_code, customer.city, customer.country]
    .filter(Boolean)
    .join(', ');
  const totalOrderValue = orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid').length;
  const openInvoiceValue = invoices
    .filter((invoice) => !['paid', 'cancelled'].includes(invoice.status))
    .reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const openOrders = orders.filter((order) => !['paid', 'cancelled', 'invoiced'].includes(order.status)).length;
  const overdueInvoices = invoices.filter(
    (invoice) => invoice.status === 'overdue' || (invoice.due_date ? new Date(invoice.due_date).getTime() < Date.now() && invoice.status !== 'paid' : false)
  ).length;
  const activity: CustomerActivityItem[] = [
    ...projects.map((project) => ({
      id: `project-${project.id}`,
      title: 'Projekt uppdaterat',
      detail: `${project.title} • ${projectStatusLabel(project.status)}`,
      at: project.created_at,
      href: `/projects/${project.id}` as Route
    })),
    ...orders.map((order) => ({
      id: `order-${order.id}`,
      title: 'Order registrerad',
      detail: `${order.order_no ?? order.id} • ${orderStatusLabel(order.status)}`,
      at: order.created_at,
      href: `/orders/${order.id}` as Route
    })),
    ...invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      title: 'Faktura registrerad',
      detail: `${invoice.invoice_no} • ${invoiceStatusLabel(invoice.status)}`,
      at: invoice.created_at,
      href: `/invoices/${invoice.id}` as Route
    }))
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);
  const canCreateCombinedInvoice = role === 'admin' || role === 'finance';

  function toggleSelectedOrder(orderId: string) {
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="secondary" size="icon" aria-label="Tillbaka till kunder">
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/45">Kund</p>
          <h2 className="text-lg font-semibold">{customer.name}</h2>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {customer.archived_at ? <Badge>Arkiverad</Badge> : <Badge>Aktiv</Badge>}
        {customer.org_no ? <Badge>{customer.org_no}</Badge> : null}
        {customer.city ? <Badge>{customer.city}</Badge> : null}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Snabba åtgärder</p>
            <p className="text-sm text-foreground/65">Öppna det som oftast används för kunden direkt härifrån.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateCombinedInvoice ? (
              <Button onClick={() => setCombinedInvoiceOpen(true)} disabled={selectableOrders.length === 0}>
                Skapa samlingsfaktura
              </Button>
            ) : null}
            {projects[0] ? (
              <Button asChild variant="outline">
                <Link href={`/projects/${projects[0].id}` as Route}>Senaste projekt</Link>
              </Button>
            ) : null}
            {orders[0] ? (
              <Button asChild variant="outline">
                <Link href={`/orders/${orders[0].id}` as Route}>Senaste order</Link>
              </Button>
            ) : null}
            {invoices[0] ? (
              <Button asChild variant="outline">
                <Link href={`/invoices/${invoices[0].id}` as Route}>Senaste faktura</Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={combinedInvoiceOpen}
        onOpenChange={(open) => {
          setCombinedInvoiceOpen(open);
          if (!open) setSelectedOrderIds([]);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Skapa samlingsfaktura</DialogTitle>
            <DialogDescription>
              Välj öppna ordrar för {customer.name}. Ordrarna grupperas per projekt men faktureras tillsammans.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <StatusCard label="Valda projekt" value={String(selectedProjectCount)} helper="unika projekt i urvalet" tone="neutral" />
              <StatusCard label="Valda ordrar" value={String(selectedOrders.length)} helper="ordrar som kommer med" tone="primary" />
              <StatusCard label="Total" value={`${selectedTotal.toFixed(2)} kr`} helper="summerat ordervärde" tone="neutral" />
            </div>

            {selectableOrders.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-sm text-foreground/70">
                  Det finns inga öppna ordrar att samla på en faktura just nu.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => {
                  const projectOrders = selectableOrders.filter((order) => order.project_id === project.id);
                  if (projectOrders.length === 0) return null;

                  return (
                    <Card key={project.id}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{project.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {projectOrders.map((order) => {
                          const selected = selectedOrderIds.includes(order.id);

                          return (
                            <button
                              key={order.id}
                              type="button"
                              onClick={() => toggleSelectedOrder(order.id)}
                              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                selected ? 'border-primary bg-primary/8' : 'border-border/70 bg-muted/10 hover:bg-muted/20'
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="font-mono text-sm">{order.order_no ?? order.id}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                                  <span>{projectTitleById[order.project_id] ?? project.title}</span>
                                  <span>{orderStatusLabel(order.status)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-semibold">{Number(order.total ?? 0).toFixed(2)} kr</p>
                                <div
                                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                                    selected ? 'border-primary bg-primary text-primary-foreground' : 'border-foreground/25 bg-background'
                                  }`}
                                >
                                  {selected ? <span className="text-[10px] font-bold">✓</span> : null}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setCombinedInvoiceOpen(false)}>
                Avbryt
              </Button>
              <Button
                onClick={() => createCombinedInvoiceMutation.mutate()}
                disabled={selectedOrders.length === 0 || createCombinedInvoiceMutation.isPending}
              >
                {createCombinedInvoiceMutation.isPending ? 'Skapar...' : 'Skapa faktura'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Projekt" value={String(projects.length)} helper="kopplade till kunden" icon={FolderKanban} />
        <SummaryCard label="Ordrar" value={String(orders.length)} helper="totalt registrerade" icon={ScrollText} />
        <SummaryCard label="Ordervärde" value={`${totalOrderValue.toFixed(2)} kr`} helper="summa av alla ordrar" icon={ReceiptText} />
        <SummaryCard label="Öppna fakturor" value={String(openInvoices)} helper="inte fullt betalda" icon={Mail} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ekonomisk status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <StatusCard
              label="Öppet fakturavärde"
              value={`${openInvoiceValue.toFixed(2)} kr`}
              helper="ej fullt betalda fakturor"
              tone="primary"
            />
            <StatusCard
              label="Förfallna fakturor"
              value={String(overdueInvoices)}
              helper="behöver följas upp"
              tone={overdueInvoices > 0 ? 'danger' : 'neutral'}
            />
            <StatusCard
              label="Senaste faktura"
              value={invoices[0]?.invoice_no ?? '-'}
              helper={invoices[0]?.created_at ? new Date(invoices[0].created_at).toLocaleDateString('sv-SE') : 'ingen ännu'}
              tone="neutral"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Senaste aktivitet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activity.length === 0 ? (
              <p className="text-sm text-foreground/70">Ingen aktivitet registrerad ännu.</p>
            ) : (
              activity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-xl border border-border/70 bg-muted/15 px-3 py-3 transition hover:border-primary/40 hover:bg-muted/25"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="mt-1 text-sm text-foreground/70">{item.detail}</p>
                    </div>
                    <p className="shrink-0 text-xs text-foreground/55">
                      {new Date(item.at).toLocaleDateString('sv-SE')}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <StatusStripCard
          label="Öppna ordrar"
          value={String(openOrders)}
          helper={openOrders > 0 ? 'pågående arbete att följa upp' : 'inga öppna ordrar just nu'}
        />
        <StatusStripCard
          label="Fakturor att bevaka"
          value={String(openInvoices)}
          helper={openInvoices > 0 ? 'ej slutbetalda fakturor' : 'allt ser betalt ut'}
        />
        <StatusStripCard
          label="Senaste aktivitet"
          value={activity[0] ? new Date(activity[0].at).toLocaleDateString('sv-SE') : '-'}
          helper={activity[0]?.title ?? 'ingen aktivitet registrerad ännu'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Grunduppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow icon={Building2} label="Kundnamn" value={customer.name} />
            <InfoRow icon={ReceiptText} label="Organisationsnummer" value={customer.org_no ?? '-'} />
            <InfoRow icon={ReceiptText} label="Momsregistreringsnummer" value={customer.vat_no ?? '-'} />
            <InfoRow icon={Phone} label="Telefon" value={customer.phone ?? '-'} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fakturering</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow icon={Mail} label="Faktura e-post" value={customer.billing_email ?? '-'} />
            <InfoRow icon={MapPin} label="Adress" value={billingAddress || '-'} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Projekt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {projectsQuery.isLoading ? <p className="text-sm text-foreground/70">Laddar projekt...</p> : null}
            {!projectsQuery.isLoading && projects.length === 0 ? <p className="text-sm text-foreground/70">Inga projekt kopplade ännu.</p> : null}
            {projects.slice(0, 5).map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="block rounded-xl border border-border/70 bg-muted/15 px-3 py-3 transition hover:border-primary/40 hover:bg-muted/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{project.title}</p>
                    <p className="mt-1 text-xs text-foreground/55">{new Date(project.created_at).toLocaleDateString('sv-SE')}</p>
                  </div>
                  <Badge>{projectStatusLabel(project.status)}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Senaste ordrar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ordersQuery.isLoading && projects.length > 0 ? <p className="text-sm text-foreground/70">Laddar ordrar...</p> : null}
            {!ordersQuery.isLoading && orders.length === 0 ? <p className="text-sm text-foreground/70">Inga ordrar kopplade ännu.</p> : null}
            {orders.slice(0, 5).map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`} className="block rounded-xl border border-border/70 bg-muted/15 px-3 py-3 transition hover:border-primary/40 hover:bg-muted/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{order.order_no ?? order.id}</p>
                    <p className="mt-1 text-xs text-foreground/55">{new Date(order.created_at).toLocaleDateString('sv-SE')}</p>
                  </div>
                  <div className="text-right">
                    <Badge>{orderStatusLabel(order.status)}</Badge>
                    <p className="mt-2 text-sm font-semibold">{Number(order.total ?? 0).toFixed(2)} kr</p>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader>
            <CardTitle>Fakturor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoicesQuery.isLoading && projects.length > 0 ? <p className="text-sm text-foreground/70">Laddar fakturor...</p> : null}
            {!invoicesQuery.isLoading && invoices.length === 0 ? <p className="text-sm text-foreground/70">Inga fakturor kopplade ännu.</p> : null}
            {invoices.slice(0, 5).map((invoice) => (
              <Link key={invoice.id} href={`/invoices/${invoice.id}`} className="block rounded-xl border border-border/70 bg-muted/15 px-3 py-3 transition hover:border-primary/40 hover:bg-muted/25">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{invoice.invoice_no}</p>
                    <p className="mt-1 text-xs text-foreground/55">
                      Förfallo: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('sv-SE') : '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge>{invoiceStatusLabel(invoice.status)}</Badge>
                    <p className="mt-2 text-sm font-semibold">
                      {Number(invoice.total ?? 0).toFixed(2)} {invoice.currency}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teknisk information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-foreground/70">
          <p className="break-all font-mono">Kund-ID: {customer.id}</p>
        </CardContent>
      </Card>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
            <p className="text-sm text-foreground/65">{helper}</p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
          <p className="mt-1 break-words text-sm font-medium text-foreground/85">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  helper,
  tone
}: {
  label: string;
  value: string;
  helper: string;
  tone: 'primary' | 'neutral' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-rose-500/30 bg-rose-500/10'
      : tone === 'primary'
        ? 'border-primary/20 bg-primary/10'
        : 'border-border/70 bg-muted/15';

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
          <p className="mt-1 text-lg font-semibold">{value}</p>
          <p className="mt-1 text-sm text-foreground/65">{helper}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/70 text-primary">
          <CircleDollarSign className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function StatusStripCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/15 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/45">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-sm text-foreground/65">{helper}</p>
    </div>
  );
}
