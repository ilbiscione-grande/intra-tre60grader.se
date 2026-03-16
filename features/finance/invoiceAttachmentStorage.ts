import { createClient } from '@/lib/supabase/client';

export const INVOICE_BUCKET = 'invoice-attachments';

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadInvoiceAttachment(input: {
  companyId: string;
  entity: 'invoice' | 'payment';
  entityId: string;
  file: File;
}) {
  const supabase = createClient();
  const ext = input.file.name.includes('.') ? input.file.name.split('.').pop() : 'bin';
  const fileName = safeName(input.file.name.replace(/\.[^.]+$/, ''));
  const path = `${input.companyId}/${input.entity}/${input.entityId}/${Date.now()}-${fileName}.${ext}`;

  const { error } = await supabase.storage.from(INVOICE_BUCKET).upload(path, input.file, {
    contentType: input.file.type || 'application/octet-stream',
    upsert: false
  });

  if (error) throw error;
  return path;
}

export async function createInvoiceAttachmentSignedUrl(path: string, expiresInSeconds = 3600) {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(INVOICE_BUCKET).createSignedUrl(path, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}
