'use client';

import Link from 'next/link';
import { ArrowLeft, Building2, FolderKanban, Mail, MapPin, Phone, ReceiptText, ScrollText } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

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
  const { companyId } = useAppContext();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const supabase = createClient();

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

  if (query.isLoading) return <p>Laddar kund...</p>;
  if (!query.data) return <p>Kunden hittades inte.</p>;

  const customer = query.data;
  const projects = projectsQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const billingAddress = [customer.address_line1, customer.address_line2, customer.postal_code, customer.city, customer.country]
    .filter(Boolean)
    .join(', ');
  const totalOrderValue = orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid').length;

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

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Projekt" value={String(projects.length)} helper="kopplade till kunden" icon={FolderKanban} />
        <SummaryCard label="Ordrar" value={String(orders.length)} helper="totalt registrerade" icon={ScrollText} />
        <SummaryCard label="Ordervärde" value={`${totalOrderValue.toFixed(2)} kr`} helper="summa av alla ordrar" icon={ReceiptText} />
        <SummaryCard label="Öppna fakturor" value={String(openInvoices)} helper="inte fullt betalda" icon={Mail} />
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
