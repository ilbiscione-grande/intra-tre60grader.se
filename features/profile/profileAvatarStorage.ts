'use client';

import { createClient } from '@/lib/supabase/client';
import { PROFILE_AVATAR_BUCKET } from '@/features/profile/profileBadge';

export async function uploadProfileAvatar(companyId: string, userId: string, file: File) {
  const supabase = createClient();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `${companyId}/${userId}/${Date.now()}.${extension}`;

  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined
  });

  if (error) throw error;
  return path;
}

export async function removeProfileAvatar(path: string | null | undefined) {
  if (!path) return;
  const supabase = createClient();
  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
  if (error) throw error;
}
