import { createClient } from '@/lib/supabase/client';
import type { VerificationAttachment } from '@/lib/types';

export const VERIFICATION_BUCKET = 'verification-attachments';

export async function fileToAttachment(file: File): Promise<VerificationAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Kunde inte läsa filen.'));
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl
  };
}

function attachmentToBlob(attachment: VerificationAttachment) {
  const [meta, data] = attachment.dataUrl.split(',', 2);
  if (!meta || !data) {
    throw new Error('Ogiltig bilage-data.');
  }

  const mime = meta.match(/data:(.*);base64/)?.[1] || attachment.type || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadVerificationAttachment(input: {
  companyId: string;
  draftId: string;
  attachment: VerificationAttachment;
}) {
  const supabase = createClient();
  const ext = input.attachment.name.includes('.') ? input.attachment.name.split('.').pop() : 'bin';
  const fileName = safeName(input.attachment.name.replace(/\.[^.]+$/, ''));
  const path = `${input.companyId}/${input.draftId}/${Date.now()}-${fileName}.${ext}`;
  const blob = attachmentToBlob(input.attachment);

  const { error } = await supabase.storage.from(VERIFICATION_BUCKET).upload(path, blob, {
    contentType: input.attachment.type,
    upsert: false
  });

  if (error) throw error;
  return path;
}

export async function createAttachmentSignedUrl(path: string, expiresInSeconds = 3600) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}
