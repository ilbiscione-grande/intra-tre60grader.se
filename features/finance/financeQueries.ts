'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createReversalVerification, createVerificationFromWizard, voidVerification } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import { deleteDraft, listDrafts, saveDraft } from '@/features/offline/syncQueue';
import type { TableRow } from '@/lib/supabase/database.types';
import type { VerificationDraft } from '@/lib/types';
import { uploadVerificationAttachment } from '@/features/finance/attachmentStorage';
import { validateVerificationDraft } from '@/features/finance/verificationValidation';

export type VerificationStatusFilter = 'all' | 'booked' | 'voided';

type FinanceOverviewRow = Pick<
  TableRow<'verifications'>,
  | 'id'
  | 'date'
  | 'description'
  | 'total'
  | 'attachment_path'
  | 'created_at'
  | 'created_by'
  | 'source'
  | 'status'
  | 'voided_at'
  | 'voided_by'
  | 'void_reason'
  | 'fiscal_year'
  | 'verification_no'
  | 'reversed_from_id'
>;

type VerificationDetailLineRow = Pick<TableRow<'verification_lines'>, 'id' | 'account_no' | 'debit' | 'credit' | 'vat_code'>;

type VerificationDetailRow = Pick<
  TableRow<'verifications'>,
  | 'id'
  | 'company_id'
  | 'date'
  | 'description'
  | 'total'
  | 'attachment_path'
  | 'created_at'
  | 'created_by'
  | 'source'
  | 'status'
  | 'voided_at'
  | 'voided_by'
  | 'void_reason'
  | 'fiscal_year'
  | 'verification_no'
  | 'reversed_from_id'
> & {
  verification_lines: VerificationDetailLineRow[];
};

export function useFinanceOverview(companyId: string) {
  return useQuery<FinanceOverviewRow[]>({
    queryKey: ['finance-overview', companyId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('verifications')
        .select('id,date,description,total,attachment_path,created_at,created_by,source,status,voided_at,voided_by,void_reason,fiscal_year,verification_no,reversed_from_id')
        .eq('company_id', companyId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(150)
        .returns<FinanceOverviewRow[]>();

      if (error) throw error;
      return data ?? [];
    }
  });
}

export function useVerificationAuditLog(
  companyId: string,
  periodStart: string,
  periodEnd: string,
  status: VerificationStatusFilter
) {
  return useQuery<FinanceOverviewRow[]>({
    queryKey: ['verification-audit-log', companyId, periodStart, periodEnd, status],
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from('verifications')
        .select('id,date,description,total,attachment_path,created_at,created_by,source,status,voided_at,voided_by,void_reason,fiscal_year,verification_no,reversed_from_id')
        .eq('company_id', companyId)
        .gte('date', periodStart)
        .lte('date', periodEnd)
        .order('created_at', { ascending: false });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query.returns<FinanceOverviewRow[]>();
      if (error) throw error;
      return data ?? [];
    }
  });
}

export function useVerificationById(companyId: string, verificationId: string) {
  return useQuery<VerificationDetailRow | null>({
    queryKey: ['verification', companyId, verificationId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('verifications')
        .select('id,company_id,date,description,total,attachment_path,created_at,created_by,source,status,voided_at,voided_by,void_reason,fiscal_year,verification_no,reversed_from_id,verification_lines(id,account_no,debit,credit,vat_code)')
        .eq('company_id', companyId)
        .eq('id', verificationId)
        .maybeSingle<VerificationDetailRow>();

      if (error) throw error;
      return data ?? null;
    }
  });
}

export function useVerificationDrafts() {
  return useQuery({
    queryKey: ['verification-drafts'],
    queryFn: () => listDrafts()
  });
}

export function useSaveDraft() {
  return useMutation({
    mutationFn: async (draft: VerificationDraft) => {
      const validation = validateVerificationDraft(draft);
      if (!validation.ok) {
        throw new Error(validation.errors[0] ?? 'Utkastet är inte giltigt.');
      }

      await saveDraft(draft);
      toast.success('Utkast sparat');
      return draft;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte spara utkast');
    }
  });
}

export function useSendVerification() {
  return useMutation({
    mutationFn: async (draft: VerificationDraft) => {
      if (!navigator.onLine) {
        throw new Error('Måste vara online för att skicka verifikation.');
      }

      const validation = validateVerificationDraft(draft);
      if (!validation.ok) {
        throw new Error(validation.errors[0] ?? 'Verifikationen är inte giltig.');
      }

      const payload: VerificationDraft = {
        ...draft,
        source: draft.source ?? 'offline',
        client_request_id: draft.client_request_id ?? draft.id
      };

      if (!payload.attachment_path && payload.attachment) {
        payload.attachment_path = await uploadVerificationAttachment({
          companyId: payload.company_id,
          draftId: payload.id,
          attachment: payload.attachment
        });
      }

      const rpcPayload: VerificationDraft = { ...payload, attachment: undefined };
      const result = await createVerificationFromWizard(rpcPayload);
      await deleteDraft(draft.id);
      toast.success('Verifikation skickad');
      return { result, payload };
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skicka verifikation');
    }
  });
}

export function useVoidVerification(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ verificationId, reason }: { verificationId: string; reason?: string }) => {
      const data = await voidVerification(verificationId, reason ?? null);
      return data;
    },
    onSuccess: async () => {
      toast.success('Verifikation makulerad');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance-overview', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['verification-audit-log', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['verification'] })
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte makulera verifikation');
    }
  });
}

export function useCreateReversalVerification(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ verificationId, reason }: { verificationId: string; reason?: string }) => {
      return createReversalVerification(verificationId, reason ?? null);
    },
    onSuccess: async () => {
      toast.success('Rättelse skapad');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['finance-overview', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['verification-audit-log', companyId] }),
        queryClient.invalidateQueries({ queryKey: ['verification'] })
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Kunde inte skapa rättelse');
    }
  });
}
