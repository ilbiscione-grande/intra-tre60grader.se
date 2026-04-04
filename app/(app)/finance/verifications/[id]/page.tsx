'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import MobileAttachmentPicker from '@/components/common/MobileAttachmentPicker';
import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useCreateReversalVerification,
  useVerificationById,
  useVoidVerification
} from '@/features/finance/financeQueries';
import { createAttachmentSignedUrl, fileToAttachment, uploadVerificationAttachment } from '@/features/finance/attachmentStorage';
import { createClient } from '@/lib/supabase/client';

type AttachmentPreview = {
  id: string;
  path: string;
  fileName: string;
  mimeType: string | null;
  createdAt: string;
  signedUrl: string;
};

type MemberLookup = {
  displayName: string | null;
  email: string | null;
};

function sourceLabel(source: string | null) {
  if (source === 'mobile') return 'Mobil';
  if (source === 'desktop') return 'Desktop';
  if (source === 'offline') return 'Offline';
  return '-';
}

function statusLabel(status: string | null) {
  if (status === 'voided') return 'Makulerad';
  return 'Bokförd';
}

function verificationNumberLabel(fiscalYear: number | null, verificationNo: number | null) {
  if (!fiscalYear || !verificationNo) return '-';
  return `${fiscalYear}-${String(verificationNo).padStart(5, '0')}`;
}

function fileExtension(path: string | null | undefined) {
  if (!path) return '';
  const cleanPath = path.split('?')[0] ?? path;
  const extension = cleanPath.split('.').pop();
  return extension ? extension.toLowerCase() : '';
}

export default function VerificationDetailsPage() {
  const { role, companyId } = useAppContext();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params.id ?? '');
  const query = useVerificationById(companyId, id);
  const voidMutation = useVoidVerification(companyId);
  const reversalMutation = useCreateReversalVerification(companyId);

  const [attachments, setAttachments] = useState<AttachmentPreview[]>([]);
  const [memberLookup, setMemberLookup] = useState<Record<string, MemberLookup>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [reversalReason, setReversalReason] = useState('');
  const [attachmentPending, setAttachmentPending] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!active) return;
      setCurrentUserId(user?.id ?? null);
    }

    void loadUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadMemberLookup() {
      if (!companyId) {
        setMemberLookup({});
        return;
      }

      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc('list_company_member_options', { p_company_id: companyId });
        if (error) throw error;
        if (!active) return;

        const nextLookup = Object.fromEntries(
          (data ?? []).map((member) => [
            member.user_id,
            {
              displayName: typeof member.display_name === 'string' && member.display_name.trim() ? member.display_name.trim() : null,
              email: typeof member.email === 'string' && member.email.trim() ? member.email.trim() : null
            }
          ])
        );

        setMemberLookup(nextLookup);
      } catch {
        if (!active) return;
        setMemberLookup({});
      }
    }

    void loadMemberLookup();
    return () => {
      active = false;
    };
  }, [companyId]);

  function actorText(actor: string | null | undefined) {
    if (!actor) return '-';
    if (currentUserId && actor === currentUserId) return 'Du';

    const member = memberLookup[actor];
    if (member?.displayName) return member.displayName;
    if (member?.email) return member.email;

    return `${actor.slice(0, 8)}...`;
  }

  useEffect(() => {
    let active = true;

    async function loadAttachments() {
      const rows = [...(query.data?.verification_attachments ?? [])].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      if (rows.length === 0) {
        setAttachments([]);
        return;
      }

      try {
        const signed = await Promise.all(
          rows.map(async (row) => ({
            id: row.id,
            path: row.path,
            fileName: row.file_name || row.path.split('/').pop() || 'Bilaga',
            mimeType: row.mime_type,
            createdAt: row.created_at,
            signedUrl: await createAttachmentSignedUrl(row.path)
          }))
        );
        if (!active) return;
        setAttachments(signed);
      } catch {
        if (!active) return;
        setAttachments([]);
      }
    }

    void loadAttachments();
    return () => {
      active = false;
    };
  }, [query.data?.verification_attachments]);

  const actorLabel = useMemo(() => {
    return actorText(query.data?.created_by);
  }, [query.data?.created_by, currentUserId, memberLookup]);

  const voidedByLabel = useMemo(() => {
    return actorText(query.data?.voided_by);
  }, [query.data?.voided_by, currentUserId, memberLookup]);

  const attachmentCount = attachments.length;

  function inferDirection() {
    const cashLine = query.data?.verification_lines.find((line) => /^19\d{2}$/.test(line.account_no));
    if (cashLine) {
      if (Number(cashLine.debit) > Number(cashLine.credit)) return 'in' as const;
      if (Number(cashLine.credit) > Number(cashLine.debit)) return 'out' as const;
    }

    const totalDebit = (query.data?.verification_lines ?? []).reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = (query.data?.verification_lines ?? []).reduce((sum, line) => sum + Number(line.credit), 0);
    return totalDebit >= totalCredit ? ('in' as const) : ('out' as const);
  }

  function inferVatRate() {
    const vatCode = query.data?.verification_lines.find((line) => line.vat_code)?.vat_code;
    if (vatCode === '0' || vatCode === '6' || vatCode === '12' || vatCode === '25') return vatCode;
    return '0';
  }

  async function handleCreateCorrectionFlow() {
    if (!query.data) return;

    const result = await reversalMutation.mutateAsync({
      verificationId: id,
      reason: reversalReason.trim() || undefined
    });

    const direction = inferDirection();
    const vatRate = inferVatRate();
    const template = direction === 'in' ? 'manual_in' : 'manual_out';
    const nextParams = new URLSearchParams({
      prefillDirection: direction,
      prefillTemplate: template,
      prefillDate: query.data.date,
      prefillDescription: query.data.description,
      prefillTotal: Number(query.data.total).toFixed(2),
      prefillVatRate: vatRate,
      returnTo: `/finance/verifications/${id}`
    });

    const reversalId =
      result && typeof result === 'object' && 'reversal_verification_id' in result
        ? String((result as { reversal_verification_id?: string }).reversal_verification_id ?? '')
        : '';

    if (reversalId) {
      nextParams.set('reversalId', reversalId);
    }

    router.push((`/finance/verifications/new?${nextParams.toString()}`) as Route);
  }

  async function handleAttachmentPick(file: File) {
    if (!query.data) return;

    try {
      setAttachmentPending(true);
      const supabase = createClient();
      const attachment = await fileToAttachment(file);
      const path = await uploadVerificationAttachment({
        companyId,
        draftId: query.data.id,
        attachment
      });

      const { error: attachmentError } = await supabase
        .from('verification_attachments')
        .insert({
          company_id: companyId,
          verification_id: query.data.id,
          path,
          file_name: attachment.name,
          mime_type: attachment.type,
          created_by: currentUserId
        });

      if (attachmentError) throw attachmentError;

      if (!query.data.attachment_path) {
        const { data, error } = await supabase
          .from('verifications')
          .update({ attachment_path: path })
          .eq('company_id', companyId)
          .eq('id', query.data.id)
          .select('id,attachment_path')
          .single();

        if (error) throw error;
        if (!data?.attachment_path) throw new Error('Bilagan kunde inte kopplas till verifikationen.');
      }

      await query.refetch();
      toast.success('Underlag uppladdat');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte ladda upp underlag');
    } finally {
      setAttachmentPending(false);
    }
  }

  return (
    <RoleGate role={role} allow={['finance', 'admin', 'auditor']}>
      <section className="space-y-4">
        <Button variant="outline" asChild>
          <Link href="/finance">Tillbaka till ekonomi</Link>
        </Button>

        {query.data ? (
          <>
            <Card className="space-y-2 p-4 text-sm">
              <p>
                <span className="font-medium">Verifikationsnummer:</span>{' '}
                {verificationNumberLabel(query.data.fiscal_year, query.data.verification_no)}
              </p>
              <p><span className="font-medium">Datum:</span> {new Date(query.data.date).toLocaleDateString('sv-SE')}</p>
              <p><span className="font-medium">Beskrivning:</span> {query.data.description}</p>
              <p><span className="font-medium">Total:</span> {Number(query.data.total).toFixed(2)} kr</p>
              <p><span className="font-medium">Status:</span> {statusLabel(query.data.status)}</p>
              <p><span className="font-medium">Källa:</span> {sourceLabel(query.data.source)}</p>
              <p><span className="font-medium">Skapad:</span> {new Date(query.data.created_at).toLocaleString('sv-SE')}</p>
              <p><span className="font-medium">Skapad av:</span> {actorLabel}</p>
              {query.data.reversed_from_id ? (
                <p><span className="font-medium">Rättelse av:</span> {query.data.reversed_from_id}</p>
              ) : null}

              {query.data.status === 'voided' ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs">
                  <p><span className="font-medium">Makulerad:</span> {query.data.voided_at ? new Date(query.data.voided_at).toLocaleString('sv-SE') : '-'}</p>
                  <p><span className="font-medium">Makulerad av:</span> {voidedByLabel}</p>
                  <p><span className="font-medium">Orsak:</span> {query.data.void_reason || '-'}</p>
                </div>
              ) : null}
            </Card>

            {query.data.status !== 'voided' && role !== 'auditor' ? (
              <>
                <Card className="space-y-2 p-4 text-sm">
                  <p className="font-medium">Makulera verifikation</p>
                  <p className="text-xs text-muted-foreground">Makulering bevarar historik och markerar posten som ogiltig.</p>
                  <Input
                    placeholder="Orsak (valfritt, men rekommenderas)"
                    value={voidReason}
                    onChange={(event) => setVoidReason(event.target.value)}
                  />
                  <Button
                    variant="destructive"
                    disabled={voidMutation.isPending}
                    onClick={() => void voidMutation.mutateAsync({ verificationId: id, reason: voidReason.trim() || undefined })}
                  >
                    Makulera
                  </Button>
                </Card>

                <Card className="space-y-2 p-4 text-sm">
                  <p className="font-medium">Skapa rättelseverifikation</p>
                  <p className="text-xs text-muted-foreground">Skapar en motbokning och makulerar originalet i samma flöde.</p>
                  <Input
                    placeholder="Orsak (valfritt, men rekommenderas)"
                    value={reversalReason}
                    onChange={(event) => setReversalReason(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={reversalMutation.isPending}
                    onClick={() => void handleCreateCorrectionFlow()}
                  >
                    Skapa rättelse och ny verifikation
                  </Button>
                </Card>
              </>
            ) : null}

            <Card className="p-0">
              <Table>
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead>Konto</TableHead>
                    <TableHead>Debet</TableHead>
                    <TableHead>Kredit</TableHead>
                    <TableHead>Momskod</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.verification_lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.account_no}</TableCell>
                      <TableCell>{Number(line.debit).toFixed(2)}</TableCell>
                      <TableCell>{Number(line.credit).toFixed(2)}</TableCell>
                      <TableCell>{line.vat_code ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="space-y-2 p-4 text-sm">
              <p className="font-medium">Bilaga</p>
              {attachmentCount > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {attachmentCount === 1 ? '1 bilaga sparad' : `${attachmentCount} bilagor sparade`}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {attachments.map((attachment) => {
                      const extension = fileExtension(attachment.fileName || attachment.path);
                      const canPreviewAsImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension);
                      const canPreviewAsPdf = extension === 'pdf';

                      return (
                        <div key={attachment.id} className="space-y-3 rounded-lg border p-3">
                          {canPreviewAsImage ? (
                            <a
                              href={attachment.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block cursor-pointer overflow-hidden rounded-lg border bg-muted/30"
                            >
                              <img
                                src={attachment.signedUrl}
                                alt={`Bilageförhandsvisning ${attachment.fileName}`}
                                className="h-40 w-full object-cover"
                              />
                            </a>
                          ) : null}
                          {canPreviewAsPdf ? (
                            <a
                              href={attachment.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-40 cursor-pointer items-center justify-center rounded-lg border bg-muted/20 text-center text-sm text-muted-foreground"
                            >
                              PDF-forhandsvisning
                            </a>
                          ) : null}
                          {!canPreviewAsImage && !canPreviewAsPdf ? (
                            <a
                              href={attachment.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-40 cursor-pointer items-center justify-center rounded-lg border bg-muted/20 text-center text-sm text-muted-foreground"
                            >
                              Oppna fil
                            </a>
                          ) : null}
                          <div className="space-y-2">
                            <div className="min-w-0">
                              <a
                                href={attachment.signedUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block truncate font-medium underline-offset-4 hover:underline"
                              >
                                {attachment.fileName}
                              </a>
                              <p className="text-xs text-muted-foreground">
                                Uppladdad {new Date(attachment.createdAt).toLocaleString('sv-SE')}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild>
                                <a href={attachment.signedUrl} target="_blank" rel="noreferrer">
                                  Öppna
                                </a>
                              </Button>
                              <Button variant="secondary" asChild>
                                <a href={attachment.signedUrl} download={attachment.fileName}>
                                  Ladda ner
                                </a>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {query.data.status !== 'voided' && role !== 'auditor' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Lägg till fler underlag som bild eller PDF.</p>
                      {attachmentPending ? (
                        <p className="text-xs text-muted-foreground">Laddar upp underlag...</p>
                      ) : null}
                      <MobileAttachmentPicker
                        label="Underlag"
                        valueLabel={`${attachmentCount} bilag${attachmentCount === 1 ? 'a' : 'or'} finns`}
                        onPick={handleAttachmentPick}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-muted-foreground">Ingen bilaga sparad.</p>
                  {query.data.status !== 'voided' && role !== 'auditor' ? (
                    <div className="space-y-2">
                      {attachmentPending ? (
                        <p className="text-xs text-muted-foreground">Laddar upp underlag...</p>
                      ) : null}
                      <MobileAttachmentPicker
                        label="Underlag"
                        onPick={handleAttachmentPick}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card className="p-4 text-sm">Verifikation hittades inte.</Card>
        )}
      </section>
    </RoleGate>
  );
}
