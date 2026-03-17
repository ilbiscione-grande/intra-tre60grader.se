import type { TableRow } from '@/lib/supabase/database.types';

export type Role = 'member' | 'finance' | 'admin' | 'auditor';
export type InternalAuthRole = 'admin' | 'employee';

export type CompanyMember = TableRow<'company_members'>;

export type AvailableCompany = {
  companyId: string;
  companyName: string;
  role: Role;
};

export type ProjectStatus = string;

export type Project = Omit<TableRow<'projects'>, 'status'> & {
  status: ProjectStatus;
};

export type ProjectColumn = TableRow<'project_columns'>;

export type VerificationAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

export type VerificationSource = 'mobile' | 'desktop' | 'offline';
export type VerificationStatus = 'booked' | 'voided';

export type VerificationDraft = {
  id: string;
  company_id: string;
  date: string;
  description: string;
  total: number;
  lines: Array<{
    account_no: string;
    debit: number;
    credit: number;
    vat_code?: string;
  }>;
  attachment?: VerificationAttachment;
  attachment_path?: string;
  source?: VerificationSource;
  status?: VerificationStatus;
  client_request_id?: string;
  created_at: string;
};

export type QueueStatus = 'queued' | 'syncing' | 'conflict' | 'failed' | 'done';

export type QueueActionType =
  | 'CREATE_PROJECT'
  | 'SET_PROJECT_STATUS'
  | 'MOVE_PROJECT'
  | 'BOOK_INVOICE_ISSUE'
  | 'REGISTER_INVOICE_PAYMENT';

export type QueueAction = {
  id: string;
  company_id: string;
  type: QueueActionType;
  project_id?: string;
  payload: Record<string, unknown>;
  baseUpdatedAt?: string;
  status: QueueStatus;
  error?: string;
  created_at: string;
  updated_at: string;
};
