'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
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

export default function VerificationDetailsPage() {
  const { role, companyId } = useAppContext();
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? '');
  const query = useVerificationById(companyId, id);
  const voidMutation = useVoidVerification(companyId);
  const reversalMutation = useCreateReversalVerification(companyId);

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
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

    async function loadAttachment() {
      const path = query.data?.attachment_path;
      if (!path) {
        setSignedUrl(null);
        return;
      }

      try {
        const url = await createAttachmentSignedUrl(path);
        if (!active) return;
        setSignedUrl(url);
      } catch {
        if (!active) return;
        setSignedUrl(null);
      }
    }

    void loadAttachment();
    return () => {
      active = false;
    };
  }, [query.data?.attachment_path]);

  const actorLabel = useMemo(() => {
    const actor = query.data?.created_by;
    if (!actor) return '-';
    if (currentUserId && actor === currentUserId) return 'Du';
    return `${actor.slice(0, 8)}...`;
  }, [query.data?.created_by, currentUserId]);

  const voidedByLabel = useMemo(() => {
    const actor = query.data?.voided_by;
    if (!actor) return '-';
    if (currentUserId && actor === currentUserId) return 'Du';
    return `${actor.slice(0, 8)}...`;
  }, [query.data?.voided_by, currentUserId]);

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

      const { error } = await supabase
        .from('verifications')
        .update({ attachment_path: path })
        .eq('company_id', companyId)
        .eq('id', query.data.id);

      if (error) throw error;

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
                    onClick={() =>
                      void reversalMutation.mutateAsync({
                        verificationId: id,
                        reason: reversalReason.trim() || undefined
                      })
                    }
                  >
                    Skapa rättelse
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
              {signedUrl ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <a href={signedUrl} target="_blank" rel="noreferrer">
                        Öppna bilaga
                      </a>
                    </Button>
                    <Button variant="secondary" asChild>
                      <a href={signedUrl} download>
                        Ladda ner
                      </a>
                    </Button>
                  </div>
                  {query.data.status !== 'voided' && role !== 'auditor' ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Byt eller komplettera underlaget om du har en bättre bild eller PDF.</p>
                      {attachmentPending ? (
                        <p className="text-xs text-muted-foreground">Laddar upp underlag...</p>
                      ) : null}
                      <MobileAttachmentPicker
                        label="Underlag"
                        valueLabel={query.data.attachment_path ? 'Bilaga finns' : undefined}
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
