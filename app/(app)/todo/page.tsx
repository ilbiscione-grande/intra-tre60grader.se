'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CheckCircle2, FileWarning, ReceiptText, Wallet } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { canViewFinance } from '@/lib/auth/capabilities';
import { createClient } from '@/lib/supabase/client';

type ProjectRow = {
  id: string;
  title: string;
  updated_at: string;
  status: string | null;
};

type InvoiceRow = {
  id: string;
  invoice_no: string;
  due_date: string;
  total: number;
  status: string;
  currency: string;
};

type SupplierInvoiceRow = {
  id: string;
  supplier_invoice_no: string;
  due_date: string;
  open_amount: number;
  currency: string;
  status: string;
};

type VerificationRow = {
  id: string;
  description: string;
  status: string | null;
  attachment_path: string | null;
  fiscal_year: number | null;
  verification_no: number | null;
  verification_lines: Array<{ debit: number | null; credit: number | null }> | null;
};

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function dayDiff(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function formatMoney(value: number, currency = 'SEK') {
  return `${Number(value).toFixed(2)} ${currency}`;
}

function verificationNumberLabel(fiscalYear: number | null, verificationNo: number | null) {
  if (!fiscalYear || !verificationNo) return 'Verifikation';
  return `${fiscalYear}-${String(verificationNo).padStart(5, '0')}`;
}

export default function TodoPage() {
  const { companyId, role, capabilities } = useAppContext();
  const canReadFinance = canViewFinance(role, capabilities);
  const supabase = useMemo(() => createClient(), []);
  const today = startOfToday();

  const projectsQuery = useQuery<ProjectRow[]>({
    queryKey: ['todo-project-watch', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id,title,updated_at,status')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: true })
        .limit(150)
        .returns<ProjectRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });

  const invoicesQuery = useQuery<InvoiceRow[]>({
    queryKey: ['todo-customer-invoices', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id,invoice_no,due_date,total,status,currency')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true })
        .limit(150)
        .returns<InvoiceRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const supplierInvoicesQuery = useQuery<SupplierInvoiceRow[]>({
    queryKey: ['todo-supplier-invoices', companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{ data: SupplierInvoiceRow[] | null; error: { message: string } | null }>;
            };
          };
        };
      })
        .from('supplier_invoices')
        .select('id,supplier_invoice_no,due_date,open_amount,currency,status')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true });

      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const verificationsQuery = useQuery<VerificationRow[]>({
    queryKey: ['todo-verifications', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('verifications')
        .select('id,description,status,attachment_path,fiscal_year,verification_no,verification_lines(debit,credit)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(120)
        .returns<VerificationRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: canReadFinance
  });

  const projectAlerts = useMemo(() => {
    return (projectsQuery.data ?? [])
      .filter((project) => project.status !== 'done')
      .map((project) => {
        const updatedAt = new Date(project.updated_at);
        const daysIdle = Math.max(0, dayDiff(updatedAt, today));
        return { ...project, daysIdle };
      })
      .filter((project) => project.daysIdle >= 7)
      .sort((a, b) => b.daysIdle - a.daysIdle)
      .slice(0, 8);
  }, [projectsQuery.data, today]);

  const overdueCustomerInvoices = useMemo(() => {
    return (invoicesQuery.data ?? [])
      .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void' && new Date(invoice.due_date) < today)
      .map((invoice) => ({ ...invoice, daysOverdue: Math.max(1, dayDiff(new Date(invoice.due_date), today)) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 8);
  }, [invoicesQuery.data, today]);

  const overdueSupplierInvoices = useMemo(() => {
    return (supplierInvoicesQuery.data ?? [])
      .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void' && Number(invoice.open_amount) > 0 && new Date(invoice.due_date) < today)
      .map((invoice) => ({ ...invoice, daysOverdue: Math.max(1, dayDiff(new Date(invoice.due_date), today)) }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 8);
  }, [supplierInvoicesQuery.data, today]);

  const verificationAlerts = useMemo(() => {
    return (verificationsQuery.data ?? [])
      .map((verification) => {
        const debit = (verification.verification_lines ?? []).reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
        const credit = (verification.verification_lines ?? []).reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
        const imbalance = Math.abs(debit - credit);
        const issues = [
          !verification.attachment_path ? 'Saknar bilaga' : null,
          imbalance > 0.005 ? `Obalans ${imbalance.toFixed(2)} kr` : null
        ].filter((issue): issue is string => Boolean(issue));

        return { ...verification, issues };
      })
      .filter((verification) => verification.status !== 'voided' && verification.issues.length > 0)
      .slice(0, 8);
  }, [verificationsQuery.data]);

  const urgentCount = projectAlerts.length + overdueCustomerInvoices.length + overdueSupplierInvoices.length + verificationAlerts.length;
  const isLoading =
    projectsQuery.isLoading ||
    (canReadFinance && (invoicesQuery.isLoading || supplierInvoicesQuery.isLoading || verificationsQuery.isLoading));

  return (
    <section className="space-y-4">
      <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-muted/20">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/45">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Att göra</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Det viktigaste just nu</h1>
                <p className="text-sm text-foreground/65">
                  Här samlas sådant som appen automatiskt bedömer behöver uppmärksamhet nu, i stället för att du ska leta i varje delvy.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                    {urgentCount} aktiva signaler
                  </Badge>
                  <Badge className="border-border/70 bg-muted/40 text-foreground/80 hover:bg-muted/40">
                    {canReadFinance ? 'Projekt + ekonomi' : 'Projektfokus'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild><Link href="/projects">Projekt</Link></Button>
              {canReadFinance ? <Button variant="outline" asChild><Link href="/finance">Ekonomi</Link></Button> : null}
              {canReadFinance ? <Button variant="outline" asChild><Link href="/invoices">Fakturor</Link></Button> : null}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TodoMetric title="Stilla projekt" value={String(projectAlerts.length)} detail="Inga uppdateringar på minst 7 dagar" icon={BriefcaseBusiness} tone="amber" />
            <TodoMetric title="Förfallna kundfakturor" value={String(overdueCustomerInvoices.length)} detail="Kundfakturor över betalningstid" icon={Wallet} tone="rose" />
            <TodoMetric title="Förfallna leverantörsfakturor" value={String(overdueSupplierInvoices.length)} detail="Utbetalningar som kräver beslut" icon={ReceiptText} tone="rose" />
            <TodoMetric title="Verifikationsflaggor" value={String(verificationAlerts.length)} detail="Saknat underlag eller obalans" icon={FileWarning} tone="blue" />
          </div>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-foreground/65">Laddar att-göra...</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <TodoSection
          title="Projekt som tappat fart"
          description="Projekt utan uppdatering på minst en vecka."
          emptyText="Inga projekt ligger still just nu."
        >
          {projectAlerts.map((project) => (
            <TodoItem
              key={project.id}
              href={`/projects/${project.id}` as Route}
              title={project.title}
              detail={`${project.daysIdle} dagar sedan senaste aktivitet`}
              badge={`${project.daysIdle} d`}
              tone="amber"
            />
          ))}
        </TodoSection>

        <TodoSection
          title="Kundfakturor som behöver följas upp"
          description="Fakturor som gått över betalningstiden."
          emptyText={canReadFinance ? 'Inga kundfakturor är förfallna.' : 'Ingen ekonomidata tillgänglig för din roll.'}
        >
          {canReadFinance
            ? overdueCustomerInvoices.map((invoice) => (
                <TodoItem
                  key={invoice.id}
                  href={`/invoices/${invoice.id}` as Route}
                  title={invoice.invoice_no || 'Faktura'}
                  detail={`${invoice.daysOverdue} dagar sen • ${formatMoney(invoice.total, invoice.currency)}`}
                  badge={`${invoice.daysOverdue} d`}
                  tone="rose"
                />
              ))
            : null}
        </TodoSection>

        <TodoSection
          title="Leverantörsfakturor som riskerar att fastna"
          description="Öppna leverantörsfakturor som passerat förfallodagen."
          emptyText={canReadFinance ? 'Inga leverantörsfakturor är förfallna.' : 'Ingen ekonomidata tillgänglig för din roll.'}
        >
          {canReadFinance
            ? overdueSupplierInvoices.map((invoice) => (
                <TodoItem
                  key={invoice.id}
                  href={'/payables' as Route}
                  title={invoice.supplier_invoice_no || 'Leverantörsfaktura'}
                  detail={`${invoice.daysOverdue} dagar sen • öppet ${formatMoney(invoice.open_amount, invoice.currency)}`}
                  badge={`${invoice.daysOverdue} d`}
                  tone="rose"
                />
              ))
            : null}
        </TodoSection>

        <TodoSection
          title="Verifikationer att kontrollera"
          description="Poster där appen hittar obalans eller saknat underlag."
          emptyText={canReadFinance ? 'Inga verifikationer kräver direkt kontroll.' : 'Ingen ekonomidata tillgänglig för din roll.'}
        >
          {canReadFinance
            ? verificationAlerts.map((verification) => (
                <TodoItem
                  key={verification.id}
                  href={`/finance/verifications/${verification.id}` as Route}
                  title={verificationNumberLabel(verification.fiscal_year, verification.verification_no)}
                  detail={`${verification.description || 'Verifikation'} • ${verification.issues.join(' • ')}`}
                  badge={verification.issues.length === 1 ? verification.issues[0] : `${verification.issues.length} flaggor`}
                  tone="blue"
                />
              ))
            : null}
        </TodoSection>
      </div>
    </section>
  );
}

function TodoMetric({
  title,
  value,
  detail,
  icon: Icon,
  tone = 'blue'
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'blue' | 'amber' | 'rose';
}) {
  const tones = {
    blue: 'border-sky-200/60 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/20',
    amber: 'border-amber-200/60 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20',
    rose: 'border-rose-200/60 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20'
  } as const;

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/45">{title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-foreground/65">{detail}</p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/70 text-foreground/70">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function TodoSection({
  title,
  description,
  emptyText,
  children
}: {
  title: string;
  description: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const childCount = Array.isArray(children) ? children.filter(Boolean).length : children ? 1 : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-foreground/65">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {childCount > 0 ? children : <p className="text-sm text-foreground/65">{emptyText}</p>}
      </CardContent>
    </Card>
  );
}

function TodoItem({
  href,
  title,
  detail,
  badge,
  tone = 'blue'
}: {
  href: Route;
  title: string;
  detail: string;
  badge: string;
  tone?: 'blue' | 'amber' | 'rose';
}) {
  const badgeTone = {
    blue: 'border-sky-300/70 bg-sky-100/70 text-sky-900 dark:border-sky-900/50 dark:bg-sky-500/15 dark:text-sky-200',
    amber: 'border-amber-300/70 bg-amber-100/70 text-amber-900 dark:border-amber-900/50 dark:bg-amber-500/15 dark:text-amber-200',
    rose: 'border-rose-300/70 bg-rose-100/70 text-rose-900 dark:border-rose-900/50 dark:bg-rose-500/15 dark:text-rose-200'
  } as const;

  return (
    <Link href={href} className="block rounded-xl border border-border/70 bg-card/70 p-3 transition hover:border-primary/35 hover:bg-muted/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-sm text-foreground/65">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge className={badgeTone[tone]}>{badge}</Badge>
          <ArrowRight className="h-4 w-4 text-foreground/45" />
        </div>
      </div>
    </Link>
  );
}
