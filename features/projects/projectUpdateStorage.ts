import { createClient } from '@/lib/supabase/client';

export const PROJECT_UPDATE_BUCKET = 'project-update-attachments';

function safeName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadProjectUpdateAttachment(input: {
  companyId: string;
  projectId: string;
  draftId: string;
  file: File;
}) {
  const supabase = createClient();
  const ext = input.file.name.includes('.') ? input.file.name.split('.').pop() : 'bin';
  const fileName = safeName(input.file.name.replace(/\.[^.]+$/, ''));
  const path = `${input.companyId}/${input.projectId}/${input.draftId}/${Date.now()}-${fileName}.${ext}`;

  const { error } = await supabase.storage.from(PROJECT_UPDATE_BUCKET).upload(path, input.file, {
    contentType: input.file.type || 'application/octet-stream',
    upsert: false
  });

  if (error) throw error;
  return path;
}

export async function createProjectUpdateAttachmentSignedUrl(path: string, expiresInSeconds = 3600) {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(PROJECT_UPDATE_BUCKET).createSignedUrl(path, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

export async function removeProjectUpdateAttachments(paths: string[]) {
  const cleanPaths = paths.filter(Boolean);
  if (cleanPaths.length === 0) return;

  const supabase = createClient();
  const { error } = await supabase.storage.from(PROJECT_UPDATE_BUCKET).remove(cleanPaths);
  if (error) throw error;
}
