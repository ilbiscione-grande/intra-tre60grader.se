'use client';

import { createClient } from '@/lib/supabase/client';
import type { TableRow } from '@/lib/supabase/database.types';

type CustomerLookupRow = Pick<TableRow<'customers'>, 'id' | 'name' | 'archived_at'>;
type CustomerInsertRow = Pick<TableRow<'customers'>, 'id'>;

export type ProjectCreatePayload = {
  company_id?: string;
  title: string;
  status: string;
  order_total?: number;
  source?: string;
  member_ids?: string[];
  customer_id?: string | null;
  customer_name?: string | null;
};

export async function ensureCustomerByName(companyId: string, rawName: string) {
  const name = rawName.trim();
  if (!name) {
    throw new Error('Kundnamn krävs');
  }

  const supabase = createClient();
  const { data: existing, error: existingError } = await supabase
    .from('customers')
    .select('id,name,archived_at')
    .eq('company_id', companyId)
    .eq('name', name)
    .limit(1)
    .maybeSingle<CustomerLookupRow>();

  if (existingError) throw existingError;

  if (existing?.id) {
    if (existing.archived_at) {
      const { error: reviveError } = await supabase
        .from('customers')
        .update({ archived_at: null })
        .eq('company_id', companyId)
        .eq('id', existing.id);

      if (reviveError) throw reviveError;

      return { id: existing.id, name, created: false, revived: true };
    }

    return { id: existing.id, name, created: false, revived: false };
  }

  const { error: insertError } = await supabase
    .from('customers')
    .insert({ company_id: companyId, name });

  if (insertError) throw insertError;

  const { data: created, error: createdError } = await supabase
    .from('customers')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', name)
    .limit(1)
    .maybeSingle<CustomerInsertRow>();

  if (createdError) throw createdError;
  if (!created?.id) throw new Error('Kunde inte skapa kund');

  return { id: created.id, name, created: true, revived: false };
}

export async function resolveCustomerForPayload(
  companyId: string,
  payload: ProjectCreatePayload
): Promise<ProjectCreatePayload> {
  if (payload.customer_id) {
    return payload;
  }

  const name = (payload.customer_name ?? '').trim();
  if (!name) {
    return { ...payload, customer_id: null };
  }

  const customer = await ensureCustomerByName(companyId, name);
  return { ...payload, customer_id: customer.id, customer_name: customer.name };
}



