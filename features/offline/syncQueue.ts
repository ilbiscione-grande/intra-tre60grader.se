'use client';

import { openDB } from 'idb';
import { bookInvoiceIssue, createProjectWithOrder, moveProject, registerInvoicePayment, setProjectStatus } from '@/lib/rpc';
import { createClient } from '@/lib/supabase/client';
import { resolveCustomerForPayload, type ProjectCreatePayload } from '@/features/projects/customerResolver';
import type { Project, ProjectStatus, QueueAction, QueueStatus, VerificationDraft } from '@/lib/types';

type LocalProjectSyncRow = Pick<Project, 'id' | 'updated_at'>;

const DB_NAME = 'projectify-bookie';
const DB_VERSION = 1;

type LocalDB = {
  queryCache: {
    key: string;
    value: unknown;
  };
  actionQueue: {
    key: string;
    value: QueueAction;
    indexes: {
      status: QueueStatus;
      company_id: string;
    };
  };
  drafts: {
    key: string;
    value: VerificationDraft;
  };
  idMap: {
    key: string;
    value: string;
  };
};

async function getDb() {
  return openDB<LocalDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('queryCache')) {
        db.createObjectStore('queryCache');
      }

      if (!db.objectStoreNames.contains('actionQueue')) {
        const queue = db.createObjectStore('actionQueue', { keyPath: 'id' });
        queue.createIndex('status', 'status');
        queue.createIndex('company_id', 'company_id');
      }

      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('idMap')) {
        db.createObjectStore('idMap');
      }
    }
  });
}

function nowIso() {
  return new Date().toISOString();
}

export function makeActionId() {
  return `action_${crypto.randomUUID()}`;
}

export async function enqueueAction(action: Omit<QueueAction, 'id' | 'created_at' | 'updated_at' | 'status'>) {
  const db = await getDb();
  const item: QueueAction = {
    ...action,
    id: makeActionId(),
    status: 'queued',
    created_at: nowIso(),
    updated_at: nowIso()
  };

  await db.put('actionQueue', item);
  return item;
}

export async function listActions(statuses?: QueueStatus[]) {
  const db = await getDb();
  const all = await db.getAll('actionQueue');
  if (!statuses || statuses.length === 0) {
    return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  return all
    .filter((action) => statuses.includes(action.status))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function updateAction(action: QueueAction) {
  const db = await getDb();
  const updated: QueueAction = {
    ...action,
    updated_at: nowIso()
  };

  await db.put('actionQueue', updated);
  return updated;
}

export async function saveDraft(draft: VerificationDraft) {
  const db = await getDb();
  await db.put('drafts', draft);
}

export async function listDrafts() {
  const db = await getDb();
  return db.getAll('drafts');
}

export async function deleteDraft(id: string) {
  const db = await getDb();
  await db.delete('drafts', id);
}

async function markAction(id: string, status: QueueStatus, error?: string) {
  const db = await getDb();
  const action = await db.get('actionQueue', id);
  if (!action) return;
  await db.put('actionQueue', {
    ...action,
    status,
    error,
    updated_at: nowIso()
  });
}

export async function setActionStatus(id: string, status: QueueStatus, error?: string) {
  await markAction(id, status, error);
}

export async function resolveConflictKeepServer(actionId: string) {
  await markAction(actionId, 'done', 'Resolved manually: kept server version');
}

export async function resolveConflictUseLocal(actionId: string) {
  const db = await getDb();
  const action = await db.get('actionQueue', actionId);
  if (!action) return;

  await db.put('actionQueue', {
    ...action,
    status: 'queued',
    baseUpdatedAt: undefined,
    error: 'Resolved manually: forced local action',
    updated_at: nowIso()
  });
}

async function hasConflict(project_id: string, baseUpdatedAt?: string) {
  if (!project_id || !baseUpdatedAt) return false;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('id,updated_at')
    .eq('id', project_id)
    .maybeSingle<LocalProjectSyncRow>();

  if (error || !data?.updated_at) {
    return false;
  }

  return new Date(data.updated_at).getTime() > new Date(baseUpdatedAt).getTime();
}

function toProjectStatus(value: unknown): ProjectStatus {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new Error('Ogiltig projektkolumn i queue payload');
}

async function runQueuedAction(action: QueueAction) {
  if (action.type === 'CREATE_PROJECT') {
    const payload = action.payload as ProjectCreatePayload;
    const resolved = await resolveCustomerForPayload(action.company_id, payload);
    await createProjectWithOrder(resolved);
    await markAction(action.id, 'done');
    return;
  }

  if (action.type === 'BOOK_INVOICE_ISSUE') {
    const invoiceId = typeof action.payload.invoice_id === 'string' ? action.payload.invoice_id : '';
    if (!invoiceId) {
      throw new Error('invoice_id saknas i köad fakturaåtgärd');
    }

    await bookInvoiceIssue(invoiceId);
    await markAction(action.id, 'done');
    return;
  }

  if (action.type === 'REGISTER_INVOICE_PAYMENT') {
    const invoiceId = typeof action.payload.invoice_id === 'string' ? action.payload.invoice_id : '';
    const amount = Number(action.payload.amount);
    const paymentDate = typeof action.payload.payment_date === 'string' ? action.payload.payment_date : '';
    const method = typeof action.payload.method === 'string' ? action.payload.method : undefined;
    const reference = typeof action.payload.reference === 'string' ? action.payload.reference : undefined;
    const note = typeof action.payload.note === 'string' ? action.payload.note : undefined;
    const allowOverpayment = Boolean(action.payload.allow_overpayment);

    if (!invoiceId || !Number.isFinite(amount) || amount <= 0 || !paymentDate) {
      throw new Error('Ogiltig payload för köad betalningsregistrering');
    }

    await registerInvoicePayment(
      invoiceId,
      amount,
      paymentDate,
      method,
      reference,
      note,
      allowOverpayment,
      undefined
    );

    await markAction(action.id, 'done');
    return;
  }

  if (!action.project_id) {
    throw new Error('project_id saknas i action');
  }

  const conflict = await hasConflict(action.project_id, action.baseUpdatedAt);
  if (conflict) {
    await markAction(action.id, 'conflict', 'Serverversionen är nyare än lokal basversion');
    return;
  }

  if (action.type === 'SET_PROJECT_STATUS') {
    await setProjectStatus(action.project_id, toProjectStatus(action.payload.to_status));
    await markAction(action.id, 'done');
    return;
  }

  if (action.type === 'MOVE_PROJECT') {
    await moveProject(
      action.project_id,
      toProjectStatus(action.payload.to_status),
      Number(action.payload.to_position)
    );
    await markAction(action.id, 'done');
    return;
  }
}

export async function processQueue(companyId: string) {
  const actions = await listActions(['queued', 'failed']);
  const companyActions = actions.filter((a) => a.company_id === companyId);

  for (const action of companyActions) {
    try {
      await markAction(action.id, 'syncing');
      await runQueuedAction(action);
    } catch (error) {
      await markAction(action.id, 'failed', error instanceof Error ? error.message : 'Sync misslyckades');
    }
  }
}

export async function retryFailed(companyId: string) {
  const actions = await listActions(['failed']);
  for (const action of actions.filter((a) => a.company_id === companyId)) {
    await markAction(action.id, 'queued');
  }

  await processQueue(companyId);
}

export async function getQueueCounts() {
  const actions = await listActions();
  return {
    queuedCount: actions.filter((a) => a.status === 'queued' || a.status === 'syncing').length,
    conflictCount: actions.filter((a) => a.status === 'conflict').length,
    failedCount: actions.filter((a) => a.status === 'failed').length
  };
}