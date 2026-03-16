'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bookInvoiceIssue, createCreditInvoice, markInvoiceCollectionStage, refundInvoicePayment, registerInvoicePayment, reverseInvoicePayment, sendInvoice, updateInvoiceDeliveryStatus } from '@/lib/rpc';
import { enqueueAction, getQueueCounts } from '@/features/offline/syncQueue';
import { useOfflineStore } from '@/features/offline/offlineStore';
import { useOnlineStatus } from '@/lib/ui/useOnlineStatus';
import { createClient } from '@/lib/supabase/client';
import type { Json, TableRow as DbRow } from '@/lib/supabase/database.types';
import { createInvoiceAttachmentSignedUrl, uploadInvoiceAttachment } from '@/features/finance/invoiceAttachmentStorage';
import MobileAttachmentPicker from '@/components/common/MobileAttachmentPicker';

type InvoiceDetailRow = {
  id: string;
  invoice_no: string;
  status: string;
  kind: string;
  credit_for_invoice_id: string | null;
  credited_at: string | null;
  currency: string;
  issue_date: string;
  supply_date: string | null;
  due_date: string;
  payment_terms_text: string | null;
  seller_vat_no: string | null;
  buyer_reference: string | null;
  subtotal: number;
  vat_total: number;
  total: number;
  company_snapshot: Json;
  customer_snapshot: Json;
  lines_snapshot: Json;
  rpc_result: Json;
  created_at: string;
  project_id: string;
  collection_stage: string;
  collection_note: string | null;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  inkasso_sent_at: string | null;
  attachment_path: string | null;
};

type PaymentRow = Pick<
  DbRow<'invoice_payments'>,
  'id' | 'amount' | 'payment_date' | 'method' | 'reference' | 'note' | 'booking_verification_id' | 'created_at' | 'direction' | 'overpayment_amount' | 'reversed_from_payment_id' | 'attachment_path'
>;


type InvoiceDeliveryRow = {
  id: string;
  channel: string;
  recipient: string | null;
  subject: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
};

type InvoiceVersionRow = {
  id: string;
  version_no: number;
  reason: string | null;
  source: string;
  created_at: string;
  created_by: string | null;
};
type SnapshotRecord = Record<string, string | number | null | undefined>;

type InvoiceLine = {
  id: string;
  title: string;
  qty: number;
  unit_price: number;
  vat_rate: number;
  total: number;
};

function formatMoney(value: number, currency: string) {
  return `${Number(value).toFixed(2)} ${currency}`;
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
  return kind === 'credit_note' ? 'Kreditfaktura' : 'Faktura';
}

function asRecord(value: Json): SnapshotRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as SnapshotRecord;
  }
  return {};
}

function parseInvoiceLines(value: Json): InvoiceLine[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row, index) => {
      const item = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : null;
      if (!item) return null;

      return {
        id: String(item.id ?? index),
        title: String(item.title ?? ''),
        qty: Number(item.qty ?? 0),
        unit_price: Number(item.unit_price ?? 0),
        vat_rate: Number(item.vat_rate ?? 0),
        total: Number(item.total ?? 0)
      };
    })
    .filter((item): item is InvoiceLine => item !== null);
}

function rpcBookingVerificationId(value: Json): string | null {
  const rec = asRecord(value);
  const id = rec.booking_verification_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export default function InvoiceDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { companyId, role } = useAppContext();
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const setOfflineCounts = useOfflineStore((s) => s.setCounts);
  const supabase = createClient();
  const supabaseUntyped = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            order: (column: string, options: { ascending: boolean }) => {
              order: (column: string, options: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
  };
  const isProduction = process.env.NODE_ENV === 'production';

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('bank');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [allowOverpayment, setAllowOverpayment] = useState(false);

  const [refundAmount, setRefundAmount] = useState('');
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundReference, setRefundReference] = useState('');
  const [refundNote, setRefundNote] = useState('');

  const [collectionFee, setCollectionFee] = useState('0');
  const [collectionNote, setCollectionNote] = useState('');
  const [invoiceAttachmentFile, setInvoiceAttachmentFile] = useState<File | null>(null);
  const [paymentAttachmentFile, setPaymentAttachmentFile] = useState<File | null>(null);

  const [sendRecipient, setSendRecipient] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  const query = useQuery<InvoiceDetailRow | null>({
    queryKey: ['invoice', companyId, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(
          'id,invoice_no,status,kind,credit_for_invoice_id,credited_at,currency,issue_date,supply_date,due_date,payment_terms_text,seller_vat_no,buyer_reference,subtotal,vat_total,total,company_snapshot,customer_snapshot,lines_snapshot,rpc_result,created_at,project_id,collection_stage,collection_note,reminder_1_sent_at,reminder_2_sent_at,inkasso_sent_at,attachment_path'
        )
        .eq('company_id', companyId)
        .eq('id', id)
        .maybeSingle<InvoiceDetailRow>();

      if (error) throw error;
      return data;
    },
    enabled: role !== 'member'
  });

  const paymentsQuery = useQuery<PaymentRow[]>({
    queryKey: ['invoice-payments', companyId, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_payments')
        .select('id,amount,payment_date,method,reference,note,booking_verification_id,created_at,direction,overpayment_amount,reversed_from_payment_id,attachment_path')
        .eq('company_id', companyId)
        .eq('invoice_id', id)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })
        .returns<PaymentRow[]>();

      if (error) throw error;
      return data ?? [];
    },
    enabled: role !== 'member'
  });


  const deliveriesQuery = useQuery<InvoiceDeliveryRow[]>({
    queryKey: ['invoice-deliveries', companyId, id],
    queryFn: async () => {
      const { data, error } = await supabaseUntyped
        .from('invoice_deliveries')
        .select('id,channel,recipient,subject,status,sent_at,delivered_at,failed_at,failure_reason,created_at')
        .eq('company_id', companyId)
        .eq('invoice_id', id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as InvoiceDeliveryRow[];
    },
    enabled: role !== 'member'
  });

  const versionsQuery = useQuery<InvoiceVersionRow[]>({
    queryKey: ['invoice-versions', companyId, id],
    queryFn: async () => {
      const { data, error } = await supabaseUntyped
        .from('invoice_versions')
        .select('id,version_no,reason,source,created_at,created_by')
        .eq('company_id', companyId)
        .eq('invoice_id', id)
        .order('version_no', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as InvoiceVersionRow[];
    },
    enabled: role !== 'member'
  });
  const creditMutation = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error('Ingen faktura vald');
      return createCreditInvoice(query.data.id);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', companyId, id] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] })
      ]);

      const invoiceNo = (result as { invoice_no?: string } | null)?.invoice_no;
      toast.success(invoiceNo ? `Kreditfaktura skapad: ${invoiceNo}` : 'Kreditfaktura skapad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa kreditfaktura');
    }
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error('Ingen faktura vald');

      if (!isOnline) {
        await enqueueAction({
          company_id: companyId,
          type: 'BOOK_INVOICE_ISSUE',
          payload: {
            invoice_id: query.data.id,
            invoice_no: query.data.invoice_no
          }
        });

        setOfflineCounts(await getQueueCounts());
        toast.info('Bokföring av faktura köad offline');
        return { queued: true as const };
      }

      return bookInvoiceIssue(query.data.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoice', companyId, id] });
      toast.success(isOnline ? 'Faktura bokförd' : 'Köad för synk');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte bokföra faktura');
    }
  });


  const sendInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error('Ingen faktura vald');
      return sendInvoice(
        query.data.id,
        'email',
        sendRecipient.trim() || undefined,
        sendSubject.trim() || undefined,
        sendMessage.trim() || undefined
      );
    },
    onSuccess: async (result) => {
      setSendMessage('');
      const response = (result as { recipient?: string | null } | null) ?? null;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', companyId, id] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-deliveries', companyId, id] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-versions', companyId, id] })
      ]);

      toast.success(response?.recipient ? `Faktura skickad till ${response.recipient}` : 'Faktura skickad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skicka faktura');
    }
  });

  const markDeliveryMutation = useMutation({
    mutationFn: async ({ deliveryId, status }: { deliveryId: string; status: 'delivered' | 'failed' }) => {
      return updateInvoiceDeliveryStatus(deliveryId, status, undefined, status === 'failed' ? 'Manuellt markerad som misslyckad' : undefined);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoice-deliveries', companyId, id] });
      toast.success('Leveransstatus uppdaterad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera leveransstatus');
    }
  });
  const paidTotal = (paymentsQuery.data ?? []).reduce((sum, row) => sum + (row.direction === 'refund' ? -Number(row.amount) : Number(row.amount)), 0);
  const openAmount = Math.max(Number(query.data?.total ?? 0) - paidTotal, 0);

  const paymentMutation = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error('Ingen faktura vald');
      const amount = Number(paymentAmount.replace(',', '.'));

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Ange ett giltigt belopp');
      }

      if (amount > openAmount) {
        throw new Error('Beloppet är större än öppet belopp');
      }

      if (!isOnline) {
        if (paymentAttachmentFile) {
          throw new Error('Betalningsbilaga kräver uppkoppling. Ta bort bilagan eller vänta tills du är online.');
        }

        await enqueueAction({
          company_id: companyId,
          type: 'REGISTER_INVOICE_PAYMENT',
          payload: {
            invoice_id: query.data.id,
            invoice_no: query.data.invoice_no,
            amount,
            payment_date: paymentDate,
            method: paymentMethod,
            reference: paymentReference.trim() || null,
            note: paymentNote.trim() || null,
            allow_overpayment: allowOverpayment
          }
        });

        setOfflineCounts(await getQueueCounts());
        toast.info('Betalning köad offline');
        return { queued: true as const };
      }

      let attachmentPath: string | undefined;
      if (paymentAttachmentFile) {
        attachmentPath = await uploadInvoiceAttachment({
          companyId,
          entity: 'payment',
          entityId: query.data.id,
          file: paymentAttachmentFile
        });
      }

      return registerInvoicePayment(
        query.data.id,
        amount,
        paymentDate,
        paymentMethod,
        paymentReference.trim() || undefined,
        paymentNote.trim() || undefined,
        allowOverpayment,
        attachmentPath
      );
    },
    onSuccess: async () => {
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNote('');
      setPaymentAttachmentFile(null);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', companyId, id] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-payments', companyId, id] }),
        queryClient.invalidateQueries({ queryKey: ['receivables-open-report', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['receivables-reconciliation-report', companyId] })
      ]);

      toast.success(isOnline ? 'Betalning registrerad' : 'Köad för synk');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte registrera betalning');
    }
  });


  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error('Ingen faktura vald');
      const amount = Number(refundAmount.replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Ange ett giltigt belopp');

      return refundInvoicePayment(
        query.data.id,
        amount,
        refundDate,
        'bank',
        refundReference.trim() || undefined,
        refundNote.trim() || undefined
      );
    },
    onSuccess: async () => {
      setRefundAmount('');
      setRefundReference('');
      setRefundNote('');

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', companyId, id] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-payments', companyId, id] })
      ]);
      toast.success('Aterbetalning registrerad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte registrera aterbetalning');
    }
  });

  const reversePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => reverseInvoicePayment(paymentId, new Date().toISOString().slice(0, 10), 'Korrigering'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoice', companyId, id] }),
        queryClient.invalidateQueries({ queryKey: ['invoices', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-payments', companyId, id] })
      ]);
      toast.success('Betalning korrigerad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte korrigera betalning');
    }
  });

  const collectionMutation = useMutation({
    mutationFn: async (stage: 'none' | 'reminder_1' | 'reminder_2' | 'inkasso' | 'dispute' | 'closed') => {
      if (!query.data) throw new Error('Ingen faktura vald');
      const fee = Number(collectionFee.replace(',', '.'));
      return markInvoiceCollectionStage(query.data.id, stage, Number.isFinite(fee) ? fee : 0, collectionNote.trim() || undefined);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invoice', companyId, id] });
      toast.success('Inkassosteg uppdaterat');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte uppdatera inkassosteg');
    }
  });

  const invoiceAttachmentMutation = useMutation({
    mutationFn: async () => {
      if (!query.data) throw new Error('Ingen faktura vald');
      if (!invoiceAttachmentFile) throw new Error('Valj en fil');

      const path = await uploadInvoiceAttachment({
        companyId,
        entity: 'invoice',
        entityId: query.data.id,
        file: invoiceAttachmentFile
      });

      const { error } = await supabase
        .from('invoices')
        .update({ attachment_path: path })
        .eq('company_id', companyId)
        .eq('id', query.data.id);

      if (error) throw error;
      return path;
    },
    onSuccess: async () => {
      setInvoiceAttachmentFile(null);
      await queryClient.invalidateQueries({ queryKey: ['invoice', companyId, id] });
      toast.success('Fakturabilaga uppladdad');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ladda upp fakturabilaga');
    }
  });

  const openInvoiceAttachmentMutation = useMutation({
    mutationFn: async () => {
      const path = query.data?.attachment_path;
      if (!path) throw new Error('Ingen bilaga finns');
      return createInvoiceAttachmentSignedUrl(path);
    },
    onSuccess: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte oppna fakturabilaga');
    }
  });

  const openPaymentAttachmentMutation = useMutation({
    mutationFn: (path: string) => createInvoiceAttachmentSignedUrl(path),
    onSuccess: (url) => window.open(url, '_blank', 'noopener,noreferrer'),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte oppna betalningsbilaga');
    }
  });  if (!query.data && !query.isLoading) {
    return (
      <RoleGate role={role} allow={['finance', 'admin', 'auditor']}>
        <p>Fakturan hittades inte.</p>
      </RoleGate>
    );
  }

  const invoice = query.data;
  const company = asRecord((invoice?.company_snapshot ?? {}) as Json);
  const customer = asRecord((invoice?.customer_snapshot ?? {}) as Json);
  const lines = parseInvoiceLines((invoice?.lines_snapshot ?? []) as Json);
  const bookingVerificationId = rpcBookingVerificationId((invoice?.rpc_result ?? {}) as Json);
  useEffect(() => {
    if (!invoice) return;

    const customerRecord = asRecord((invoice.customer_snapshot ?? {}) as Json);
    const recipient = typeof customerRecord.billing_email === 'string' ? customerRecord.billing_email : '';

    setSendRecipient((prev) => (prev.trim().length > 0 ? prev : recipient));
    setSendSubject((prev) => (prev.trim().length > 0 ? prev : `Faktura ${invoice.invoice_no}`));
  }, [invoice]);

  return (
    <RoleGate role={role} allow={['finance', 'admin', 'auditor']}>
      {!invoice ? (
        <p>Laddar faktura...</p>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/invoices">Tillbaka</Link>
            </Button>
            <Button asChild>
              <Link href={`/api/invoices/${invoice.id}/export`}>Exportera JSON</Link>
            </Button>
            <Button asChild>
              <Link href={`/invoices/${invoice.id}/print`} target="_blank">
                Skriv ut / PDF
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/projects/${invoice.project_id}`}>Öppna projekt</Link>
            </Button>
            {invoice.kind !== 'credit_note' && !invoice.credited_at && role !== 'auditor' ? (
              <Button onClick={() => creditMutation.mutate()} disabled={creditMutation.isPending}>
                {creditMutation.isPending ? 'Skapar...' : 'Skapa kreditfaktura'}
              </Button>
            ) : null}
            {!bookingVerificationId && role !== 'auditor' ? (
              <Button onClick={() => bookMutation.mutate()} disabled={bookMutation.isPending}>
                {bookMutation.isPending ? (isOnline ? 'Bokför...' : 'Köar...') : isOnline ? 'Bokför faktura' : 'Köa bokföring'}
              </Button>
            ) : null}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{invoice.invoice_no}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{fakturaTypEtikett(invoice.kind)}</Badge>
                <Badge>{fakturaStatusEtikett(invoice.status)}</Badge>
                <Badge>Inkassosteg: {invoice.collection_stage}</Badge>
                <Badge>Fakturadatum: {new Date(invoice.issue_date).toLocaleDateString('sv-SE')}</Badge>
                <Badge>Leveransdatum: {new Date(invoice.supply_date ?? invoice.issue_date).toLocaleDateString('sv-SE')}</Badge>
                <Badge>Förfallodatum: {new Date(invoice.due_date).toLocaleDateString('sv-SE')}</Badge>
                <Badge>Villkor: {invoice.payment_terms_text ?? '30 dagar netto'}</Badge>
              </div>

              {invoice.credit_for_invoice_id ? (
                <p>
                  Krediterar faktura:{' '}
                  <Link className="underline underline-offset-2" href={`/invoices/${invoice.credit_for_invoice_id}`}>
                    Öppna originalfaktura
                  </Link>
                </p>
              ) : null}

              {invoice.credited_at ? <p>Krediterad: {new Date(invoice.credited_at).toLocaleString('sv-SE')}</p> : null}

              {role !== 'auditor' && invoice.kind === 'invoice' ? (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 font-medium">Paminnelse / Inkasso</p>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input value={collectionFee} onChange={(event) => setCollectionFee(event.target.value)} placeholder="Avgift" />
                    <Input value={collectionNote} onChange={(event) => setCollectionNote(event.target.value)} placeholder="Notering" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => collectionMutation.mutate('reminder_1')}>P1</Button>
                      <Button size="sm" variant="outline" onClick={() => collectionMutation.mutate('reminder_2')}>P2</Button>
                      <Button size="sm" variant="outline" onClick={() => collectionMutation.mutate('inkasso')}>Inkasso</Button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border p-3">
                <p className="mb-2 font-medium">Fakturabilaga</p>
                <div className="flex flex-wrap items-center gap-2">
                  <MobileAttachmentPicker label="Fakturabilaga" valueLabel={invoiceAttachmentFile?.name} onPick={(file) => setInvoiceAttachmentFile(file)} onClear={() => setInvoiceAttachmentFile(null)} />
                  {role !== 'auditor' ? (
                    <Button size="sm" onClick={() => invoiceAttachmentMutation.mutate()} disabled={invoiceAttachmentMutation.isPending || !invoiceAttachmentFile}>
                      Ladda upp
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => openInvoiceAttachmentMutation.mutate()} disabled={!invoice.attachment_path || openInvoiceAttachmentMutation.isPending}>
                    Oppna
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-foreground/70">Delsumma</p>
                  <p className="text-base font-semibold">{formatMoney(Number(invoice.subtotal), invoice.currency)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-foreground/70">Moms</p>
                  <p className="text-base font-semibold">{formatMoney(Number(invoice.vat_total), invoice.currency)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-foreground/70">Total</p>
                  <p className="text-base font-semibold">{formatMoney(Number(invoice.total), invoice.currency)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-foreground/70">Återstår</p>
                  <p className="text-base font-semibold">{formatMoney(openAmount, invoice.currency)}</p>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <p className="font-medium">Bokföringsstatus</p>
                {bookingVerificationId ? (
                  <p className="text-sm">
                    Bokförd i verifikation{' '}
                    <Link className="underline underline-offset-2" href={`/finance/verifications/${bookingVerificationId}`}>
                      {bookingVerificationId}
                    </Link>
                  </p>
                ) : (
                  <p className="text-sm text-foreground/70">Inte bokförd ännu.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Utskick och leverans</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {role !== 'auditor' && invoice.status !== 'void' ? (
                <div className="grid gap-2 md:grid-cols-4">
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span>Mottagare (e-post)</span>
                    <Input value={sendRecipient} onChange={(event) => setSendRecipient(event.target.value)} placeholder="kund@exempel.se" />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span>Ämne</span>
                    <Input value={sendSubject} onChange={(event) => setSendSubject(event.target.value)} placeholder="Faktura" />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-3">
                    <span>Meddelande (valfritt)</span>
                    <Input value={sendMessage} onChange={(event) => setSendMessage(event.target.value)} placeholder="Meddelande till kund" />
                  </label>
                  <div className="flex items-end">
                    <Button className="w-full" onClick={() => sendInvoiceMutation.mutate()} disabled={sendInvoiceMutation.isPending}>
                      {sendInvoiceMutation.isPending ? 'Skickar...' : 'Skicka nu'}
                    </Button>
                  </div>
                </div>
              ) : null}

              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Tid</TableHead>
                    <TableHead>Kanal</TableHead>
                    <TableHead>Mottagare</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Åtgärd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(deliveriesQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-foreground/70">Inga utskick registrerade ännu.</TableCell>
                    </TableRow>
                  ) : (
                    (deliveriesQuery.data ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{new Date(row.created_at).toLocaleString('sv-SE')}</TableCell>
                        <TableCell>{row.channel}</TableCell>
                        <TableCell>{row.recipient ?? '-'}</TableCell>
                        <TableCell>
                          <Badge>{row.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {role !== 'auditor' ? (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => markDeliveryMutation.mutate({ deliveryId: row.id, status: 'delivered' })} disabled={markDeliveryMutation.isPending || row.status === 'delivered'}>
                                Markera levererad
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => markDeliveryMutation.mutate({ deliveryId: row.id, status: 'failed' })} disabled={markDeliveryMutation.isPending || row.status === 'failed'}>
                                Markera failed
                              </Button>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Versionshistorik</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Skapad</TableHead>
                    <TableHead>Källa</TableHead>
                    <TableHead>Anledning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(versionsQuery.data ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-foreground/70">Ingen versionsdata.</TableCell>
                    </TableRow>
                  ) : (
                    (versionsQuery.data ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">v{row.version_no}</TableCell>
                        <TableCell>{new Date(row.created_at).toLocaleString('sv-SE')}</TableCell>
                        <TableCell>{row.source}</TableCell>
                        <TableCell>{row.reason ?? '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {invoice.kind === 'invoice' ? (
            <Card>
              <CardHeader>
                <CardTitle>Betalningar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {role !== 'auditor' && invoice.status !== 'void' ? (
                  <div className="grid gap-2 md:grid-cols-6">
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span>Belopp</span>
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={paymentAmount}
                        onChange={(event) => setPaymentAmount(event.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Betaldatum</span>
                      <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Metod</span>
                      <Input value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>Referens</span>
                      <Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
                    </label>
                    <div className="flex items-end md:col-span-1">
                      <Button className="w-full" onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending || openAmount <= 0}>
                        {paymentMutation.isPending ? (isOnline ? 'Registrerar...' : 'Köar...') : openAmount <= 0 ? 'Fullbetald' : isOnline ? 'Registrera' : 'Köa'}
                      </Button>
                    </div>
                    <label className="space-y-1 text-sm md:col-span-4">
                      <span>Notering (valfritt)</span>
                      <Input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 text-sm md:col-span-2">
                      <input type="checkbox" checked={allowOverpayment} onChange={(event) => setAllowOverpayment(event.target.checked)} />
                      Tillat overbetalning
                    </label>                    <label className="space-y-1 text-sm md:col-span-6">
                      <span>Bilaga till betalning (valfritt)</span>
                      <MobileAttachmentPicker label="Betalningsbilaga" valueLabel={paymentAttachmentFile?.name} onPick={(file) => setPaymentAttachmentFile(file)} onClear={() => setPaymentAttachmentFile(null)} />
                    </label>
                  </div>
                ) : null}

                {role !== 'auditor' && invoice.status !== 'void' ? (
                  <div className="grid gap-2 rounded-lg border p-3 md:grid-cols-5">
                    <p className="md:col-span-5 text-sm font-medium">Aterbetalning</p>
                    <Input placeholder="Belopp" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} />
                    <Input type="date" value={refundDate} onChange={(event) => setRefundDate(event.target.value)} />
                    <Input placeholder="Referens" value={refundReference} onChange={(event) => setRefundReference(event.target.value)} />
                    <Input placeholder="Notering" value={refundNote} onChange={(event) => setRefundNote(event.target.value)} />
                    <Button onClick={() => refundMutation.mutate()} disabled={refundMutation.isPending}>Registrera aterbetalning</Button>
                  </div>
                ) : null}

                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Metod</TableHead>
                      <TableHead>Referens</TableHead>
                      <TableHead>Bilaga</TableHead>
                      <TableHead>Verifikation</TableHead>
                      <TableHead className="text-right">Belopp</TableHead>
                      <TableHead className="text-right">Atgard</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(paymentsQuery.data ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-foreground/70">
                          Inga betalningar registrerade ännu.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (paymentsQuery.data ?? []).map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{new Date(payment.payment_date).toLocaleDateString('sv-SE')}</TableCell>
                          <TableCell>{payment.direction === 'refund' ? 'Aterbetalning' : 'Inbetalning'}</TableCell>
                          <TableCell>{payment.method}</TableCell>
                          <TableCell>{payment.reference || '-'}</TableCell>
                          <TableCell>
                            {payment.attachment_path ? (
                              <Button size="sm" variant="outline" onClick={() => openPaymentAttachmentMutation.mutate(payment.attachment_path!)}>
                                Oppna
                              </Button>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {payment.booking_verification_id ? (
                              <Link href={`/finance/verifications/${payment.booking_verification_id}`} className="underline underline-offset-2">
                                {payment.booking_verification_id}
                              </Link>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-right">{payment.direction === 'refund' ? '-' : ''}{formatMoney(Number(payment.amount), invoice.currency)}</TableCell>
                          <TableCell className="text-right">
                            {role !== 'auditor' && !payment.reversed_from_payment_id ? (
                              <Button size="sm" variant="outline" onClick={() => reversePaymentMutation.mutate(payment.id)} disabled={reversePaymentMutation.isPending}>
                                Korrigera
                              </Button>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Fakturapart</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-2 font-medium">Företag</p>
                <InfoRow label="Namn" value={String(company.name ?? '-')} />
                <InfoRow label="Org.nr" value={String(company.org_no ?? '-')} />
                <InfoRow label="Momsnr" value={String(invoice.seller_vat_no ?? company.vat_no ?? '-')} />
                <InfoRow label="Adress" value={String(company.address_line1 ?? '-')} />
                <InfoRow label="Postort" value={`${String(company.postal_code ?? '')} ${String(company.city ?? '')}`.trim() || '-'} />
                <InfoRow label="Land" value={String(company.country ?? '-')} />
                <InfoRow label="E-post" value={String(company.billing_email ?? '-')} />
                <InfoRow label="Telefon" value={String(company.phone ?? '-')} />
              </div>

              <div className="rounded-lg border p-3 text-sm">
                <p className="mb-2 font-medium">Kund</p>
                <InfoRow label="Namn" value={String(customer.name ?? '-')} />
                <InfoRow label="Kund-ID" value={String(customer.customer_id ?? '-')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fakturarader</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead className="text-right">Antal</TableHead>
                    <TableHead className="text-right">A-pris</TableHead>
                    <TableHead className="text-right">Moms %</TableHead>
                    <TableHead className="text-right">Radtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-foreground/70">
                        Inga fakturarader.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.title}</TableCell>
                        <TableCell className="text-right">{line.qty.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{line.unit_price.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{line.vat_rate.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{line.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Teknisk metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(invoice.rpc_result, null, 2)}</pre>
            </CardContent>
          </Card>
        </section>
      )}
    </RoleGate>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-2">
      <span className="w-24 shrink-0 text-foreground/70">{label}</span>
      <span className="font-medium">{value}</span>
    </p>
  );
}


























































