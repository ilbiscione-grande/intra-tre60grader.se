import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { ProjectStatus, VerificationDraft } from '@/lib/types';

type Fn = Database['public']['Functions'];

type MoveProjectArgs = Fn['move_project']['Args'];
type SetProjectStatusArgs = Fn['set_project_status']['Args'];
type CreateProjectWithOrderArgs = Fn['create_project_with_order']['Args'];
type CreateVerificationArgs = Fn['create_verification_from_wizard']['Args'];
type CreateInvoiceArgs = Fn['create_invoice_from_order']['Args'];
type CreateCombinedInvoiceArgs = Fn['create_invoice_from_orders']['Args'];
type CreatePartialInvoiceArgs = Fn['create_partial_invoice_from_order']['Args'];
type CreatePartialInvoiceFromLinesArgs = Fn['create_partial_invoice_from_order_lines']['Args'];
type VatReportArgs = Fn['vat_report']['Args'];
type VoidVerificationArgs = Fn['void_verification']['Args'];
type CreateReversalVerificationArgs = Fn['create_reversal_verification']['Args'];
type CreateCreditInvoiceArgs = Fn['create_credit_invoice']['Args'];
type CreateCreditInvoiceFromLinesArgs = Fn['create_credit_invoice_from_lines']['Args'];
type BookInvoiceIssueArgs = Fn['book_invoice_issue']['Args'];
type RegisterInvoicePaymentArgs = Fn['register_invoice_payment']['Args'];
type RefundInvoicePaymentArgs = Fn['refund_invoice_payment']['Args'];
type ReverseInvoicePaymentArgs = Fn['reverse_invoice_payment']['Args'];
type MarkInvoiceCollectionStageArgs = Fn['mark_invoice_collection_stage']['Args'];
type PeriodCloseChecklistArgs = Fn['period_close_checklist']['Args'];
type ReceivablesOpenReportArgs = Fn['receivables_open_report']['Args'];
type ReceivablesReconciliationReportArgs = Fn['receivables_reconciliation_report']['Args'];

type RpcError = {
  message?: string;
  details?: string;
  hint?: string;
};

function throwRpcError(error: RpcError | null) {
  if (!error) return;
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  throw new Error(parts.join(' | ') || 'RPC-fel');
}

export async function moveProject(
  project_id: MoveProjectArgs['project_id'],
  to_status: ProjectStatus,
  to_position: MoveProjectArgs['to_position']
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('move_project', {
    project_id,
    to_status,
    to_position
  });

  throwRpcError(error);
  return data;
}

export async function setProjectStatus(
  project_id: SetProjectStatusArgs['project_id'],
  to_status: ProjectStatus
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('set_project_status', {
    project_id,
    to_status
  });

  throwRpcError(error);
  return data;
}

export async function createProjectWithOrder(payload: CreateProjectWithOrderArgs['payload']) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_project_with_order', {
    payload
  });

  throwRpcError(error);
  return data;
}

export async function createVerificationFromWizard(payload: VerificationDraft) {
  const supabase = createClient();
  const args: CreateVerificationArgs = { payload };
  const { data, error } = await supabase.rpc('create_verification_from_wizard', args);

  throwRpcError(error);
  return data;
}

export async function createInvoiceFromOrder(order_id: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_invoice_from_order', {
    p_order_id: order_id as CreateInvoiceArgs['p_order_id']
  });

  throwRpcError(error);
  return data;
}

export async function createInvoiceFromOrders(order_ids: CreateCombinedInvoiceArgs['order_ids']) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_invoice_from_orders', {
    order_ids
  });

  throwRpcError(error);
  return data;
}

export async function createPartialInvoiceFromOrder(
  p_order_id: CreatePartialInvoiceArgs['p_order_id'],
  p_invoice_total: CreatePartialInvoiceArgs['p_invoice_total']
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_partial_invoice_from_order', {
    p_order_id,
    p_invoice_total
  });

  throwRpcError(error);
  return data;
}

export async function createPartialInvoiceFromOrderLines(
  p_order_id: CreatePartialInvoiceFromLinesArgs['p_order_id'],
  p_order_line_ids: CreatePartialInvoiceFromLinesArgs['p_order_line_ids']
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_partial_invoice_from_order_lines', {
    p_order_id,
    p_order_line_ids
  });

  throwRpcError(error);
  return data;
}

export async function createCreditInvoice(
  p_original_invoice_id: CreateCreditInvoiceArgs['p_original_invoice_id'],
  p_reason?: CreateCreditInvoiceArgs['p_reason']
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_credit_invoice', {
    p_original_invoice_id,
    p_reason: p_reason ?? null
  });

  throwRpcError(error);
  return data;
}

export async function createCreditInvoiceFromLines(
  p_original_invoice_id: CreateCreditInvoiceFromLinesArgs['p_original_invoice_id'],
  p_line_ids: CreateCreditInvoiceFromLinesArgs['p_line_ids'],
  p_reason?: CreateCreditInvoiceFromLinesArgs['p_reason']
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_credit_invoice_from_lines', {
    p_original_invoice_id,
    p_line_ids,
    p_reason: p_reason ?? null
  });

  throwRpcError(error);
  return data;
}

export async function bookInvoiceIssue(p_invoice_id: BookInvoiceIssueArgs['p_invoice_id']) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('book_invoice_issue', {
    p_invoice_id
  });

  throwRpcError(error);
  return data;
}

export async function registerInvoicePayment(
  p_invoice_id: RegisterInvoicePaymentArgs['p_invoice_id'],
  p_amount: RegisterInvoicePaymentArgs['p_amount'],
  p_payment_date: RegisterInvoicePaymentArgs['p_payment_date'],
  p_method?: RegisterInvoicePaymentArgs['p_method'],
  p_reference?: RegisterInvoicePaymentArgs['p_reference'],
  p_note?: RegisterInvoicePaymentArgs['p_note'],
  p_allow_overpayment?: RegisterInvoicePaymentArgs['p_allow_overpayment'],
  p_attachment_path?: RegisterInvoicePaymentArgs['p_attachment_path']
) {
  const supabase = createClient();
  const args: RegisterInvoicePaymentArgs = {
    p_invoice_id,
    p_amount,
    p_payment_date,
    p_method: p_method ?? null,
    p_reference: p_reference ?? null,
    p_note: p_note ?? null,
    p_allow_overpayment: p_allow_overpayment ?? false,
    p_attachment_path: p_attachment_path ?? null
  };

  const { data, error } = await supabase.rpc('register_invoice_payment', args);
  throwRpcError(error);
  return data;
}

export async function refundInvoicePayment(
  p_invoice_id: RefundInvoicePaymentArgs['p_invoice_id'],
  p_amount: RefundInvoicePaymentArgs['p_amount'],
  p_payment_date: RefundInvoicePaymentArgs['p_payment_date'],
  p_method?: RefundInvoicePaymentArgs['p_method'],
  p_reference?: RefundInvoicePaymentArgs['p_reference'],
  p_note?: RefundInvoicePaymentArgs['p_note'],
  p_attachment_path?: RefundInvoicePaymentArgs['p_attachment_path']
) {
  const supabase = createClient();
  const args: RefundInvoicePaymentArgs = {
    p_invoice_id,
    p_amount,
    p_payment_date,
    p_method: p_method ?? null,
    p_reference: p_reference ?? null,
    p_note: p_note ?? null,
    p_attachment_path: p_attachment_path ?? null
  };

  const { data, error } = await supabase.rpc('refund_invoice_payment', args);
  throwRpcError(error);
  return data;
}

export async function reverseInvoicePayment(
  p_payment_id: ReverseInvoicePaymentArgs['p_payment_id'],
  p_reverse_date?: ReverseInvoicePaymentArgs['p_reverse_date'],
  p_reason?: ReverseInvoicePaymentArgs['p_reason']
) {
  const supabase = createClient();
  const args: ReverseInvoicePaymentArgs = {
    p_payment_id,
    p_reverse_date,
    p_reason: p_reason ?? null
  };

  const { data, error } = await supabase.rpc('reverse_invoice_payment', args);
  throwRpcError(error);
  return data;
}

export async function markInvoiceCollectionStage(
  p_invoice_id: MarkInvoiceCollectionStageArgs['p_invoice_id'],
  p_stage: MarkInvoiceCollectionStageArgs['p_stage'],
  p_fee?: MarkInvoiceCollectionStageArgs['p_fee'],
  p_note?: MarkInvoiceCollectionStageArgs['p_note'],
  p_sent_at?: MarkInvoiceCollectionStageArgs['p_sent_at']
) {
  const supabase = createClient();
  const args: MarkInvoiceCollectionStageArgs = {
    p_invoice_id,
    p_stage,
    p_fee: p_fee ?? 0,
    p_note: p_note ?? null,
    p_sent_at
  };

  const { data, error } = await supabase.rpc('mark_invoice_collection_stage', args);
  throwRpcError(error);
  return data;
}

export async function periodCloseChecklist(
  p_company_id: PeriodCloseChecklistArgs['p_company_id'],
  p_period_start: PeriodCloseChecklistArgs['p_period_start'],
  p_period_end: PeriodCloseChecklistArgs['p_period_end']
) {
  const supabase = createClient();
  const args: PeriodCloseChecklistArgs = { p_company_id, p_period_start, p_period_end };
  const { data, error } = await supabase.rpc('period_close_checklist', args);

  throwRpcError(error);
  return data;
}

export async function vatReport(
  company_id: VatReportArgs['company_id'],
  period_start: VatReportArgs['period_start'],
  period_end: VatReportArgs['period_end']
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('vat_report', {
    company_id,
    period_start,
    period_end
  });

  throwRpcError(error);
  return data;
}

export async function voidVerification(
  verification_id: VoidVerificationArgs['verification_id'],
  reason?: VoidVerificationArgs['reason']
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('void_verification', {
    verification_id,
    reason: reason ?? null
  });

  throwRpcError(error);
  return data;
}

export async function createReversalVerification(
  original_verification_id: CreateReversalVerificationArgs['original_verification_id'],
  reason?: CreateReversalVerificationArgs['reason']
) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('create_reversal_verification', {
    original_verification_id,
    reason: reason ?? null
  });

  throwRpcError(error);
  return data;
}

export async function setPeriodLock(company_id: string, locked_until: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('set_period_lock', {
    p_company_id: company_id,
    p_locked_until: locked_until
  });

  throwRpcError(error);
  return data;
}

export async function generalLedgerReport(company_id: string, period_start: string, period_end: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('general_ledger_report', {
    p_company_id: company_id,
    p_period_start: period_start,
    p_period_end: period_end
  });

  throwRpcError(error);
  return data;
}

export async function trialBalanceReport(company_id: string, as_of: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('trial_balance_report', {
    p_company_id: company_id,
    p_as_of: as_of
  });

  throwRpcError(error);
  return data;
}

export async function incomeStatementReport(company_id: string, period_start: string, period_end: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('income_statement_report', {
    p_company_id: company_id,
    p_period_start: period_start,
    p_period_end: period_end
  });

  throwRpcError(error);
  return data;
}

export async function balanceSheetReport(company_id: string, as_of: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('balance_sheet_report', {
    p_company_id: company_id,
    p_as_of: as_of
  });

  throwRpcError(error);
  return data;
}

export async function receivablesOpenReport(
  p_company_id: ReceivablesOpenReportArgs['p_company_id'],
  p_as_of?: ReceivablesOpenReportArgs['p_as_of']
) {
  const supabase = createClient();
  const args: ReceivablesOpenReportArgs = p_as_of ? { p_company_id, p_as_of } : { p_company_id };
  const { data, error } = await supabase.rpc('receivables_open_report', args);
  throwRpcError(error);
  return data;
}

export async function receivablesReconciliationReport(
  p_company_id: ReceivablesReconciliationReportArgs['p_company_id'],
  p_as_of?: ReceivablesReconciliationReportArgs['p_as_of']
) {
  const supabase = createClient();
  const args: ReceivablesReconciliationReportArgs = p_as_of ? { p_company_id, p_as_of } : { p_company_id };
  const { data, error } = await supabase.rpc('receivables_reconciliation_report', args);
  throwRpcError(error);
  return data;
}

export async function financeAuditLogReport(company_id: string, limit = 100) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('finance_audit_log_report', {
    p_company_id: company_id,
    p_limit: limit
  });

  throwRpcError(error);
  return data;
}

export async function importBankTransactions(
  p_company_id: string,
  p_rows: Array<Record<string, unknown>>,
  p_source = 'csv',
  p_file_name: string | null = null
) {
  const supabase = createClient();
  const supabaseUntyped = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  };

  const { data, error } = await supabaseUntyped.rpc('import_bank_transactions', {
    p_company_id,
    p_rows,
    p_source,
    p_file_name
  });

  throwRpcError(error);
  return data;
}

export async function autoMatchBankTransactions(
  p_company_id: string,
  p_days_tolerance = 5,
  p_amount_tolerance = 1
) {
  const supabase = createClient();
  const supabaseUntyped = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  };

  const { data, error } = await supabaseUntyped.rpc('auto_match_bank_transactions', {
    p_company_id,
    p_days_tolerance,
    p_amount_tolerance
  });

  throwRpcError(error);
  return data;
}

export async function confirmBankTransactionMatch(p_match_id: string, p_payment_method = 'bank') {
  const supabase = createClient();
  const supabaseUntyped = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  };

  const { data, error } = await supabaseUntyped.rpc('confirm_bank_transaction_match', {
    p_match_id,
    p_payment_method
  });

  throwRpcError(error);
  return data;
}

export async function rejectBankTransactionMatch(p_match_id: string, p_reason?: string) {
  const supabase = createClient();
  const supabaseUntyped = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  };

  const { data, error } = await supabaseUntyped.rpc('reject_bank_transaction_match', {
    p_match_id,
    p_reason: p_reason ?? null
  });

  throwRpcError(error);
  return data;
}

export async function financeAuditChainVerify(
  p_company_id: string,
  p_from_event_no?: number,
  p_to_event_no?: number
) {
  const supabase = createClient();
  const supabaseUntyped = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  };

  const { data, error } = await supabaseUntyped.rpc('finance_audit_chain_verify', {
    p_company_id,
    p_from_event_no: p_from_event_no ?? null,
    p_to_event_no: p_to_event_no ?? null
  });

  throwRpcError(error);
  return data;
}

export async function sendInvoice(
  p_invoice_id: string,
  p_channel = 'email',
  p_recipient?: string,
  p_subject?: string,
  p_message?: string
) {
  const supabase = createClient();
  const supabaseUntyped = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  };

  const { data, error } = await supabaseUntyped.rpc('send_invoice', {
    p_invoice_id,
    p_channel,
    p_recipient: p_recipient ?? null,
    p_subject: p_subject ?? null,
    p_message: p_message ?? null
  });

  throwRpcError(error);
  return data;
}

export async function updateInvoiceDeliveryStatus(
  p_delivery_id: string,
  p_status: 'queued' | 'sent' | 'delivered' | 'failed',
  p_provider_response?: Record<string, unknown>,
  p_failure_reason?: string
) {
  const supabase = createClient();
  const supabaseUntyped = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  };

  const { data, error } = await supabaseUntyped.rpc('update_invoice_delivery_status', {
    p_delivery_id,
    p_status,
    p_provider_response: p_provider_response ?? null,
    p_failure_reason: p_failure_reason ?? null
  });

  throwRpcError(error);
  return data;
}
