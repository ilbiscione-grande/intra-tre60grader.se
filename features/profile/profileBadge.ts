'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/lib/supabase/database.types';

export const PROFILE_BADGE_PREFERENCE_KEY = 'profile_badge';
export const PROFILE_AVATAR_BUCKET = 'profile-avatars';
export const PROFILE_BADGE_COLORS = ['#3B82F6', '#14B8A6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#22C55E', '#64748B'];
export const DEFAULT_PROFILE_BADGE_COLOR = PROFILE_BADGE_COLORS[0];
export const PROFILE_BADGE_EMOJIS = ['😀', '😎', '🤓', '🦊', '🐼', '🐯', '🐸', '🦉', '🐙', '🚀'];

export type ProfileBadgePreference = {
  color: string;
  avatarPath: string | null;
  avatarUrl: string | null;
  emoji: string | null;
};

function parsePreference(value: Json | null | undefined): { color: string; avatarPath: string | null; emoji: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { color: DEFAULT_PROFILE_BADGE_COLOR, avatarPath: null, emoji: null };
  }

  const record = value as Record<string, unknown>;
  const color = typeof record.color === 'string' && record.color.trim() ? record.color : DEFAULT_PROFILE_BADGE_COLOR;
  const avatarPath = typeof record.avatar_path === 'string' && record.avatar_path.trim() ? record.avatar_path : null;
  const emoji = typeof record.emoji === 'string' && record.emoji.trim() ? record.emoji : null;

  return { color, avatarPath, emoji };
}

export function buildUserInitials(label?: string | null) {
  if (!label) return '?';
  const clean = label.split('@')[0] ?? label;
  const initials = clean
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);

  return initials || '?';
}

export function useOwnProfileBadge(companyId: string) {
  return useQuery<ProfileBadgePreference>({
    queryKey: ['own-profile-badge', companyId],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        return { color: DEFAULT_PROFILE_BADGE_COLOR, avatarPath: null, avatarUrl: null, emoji: null };
      }

      const { data, error } = await supabase
        .from('user_company_preferences')
        .select('preference_value')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .eq('preference_key', PROFILE_BADGE_PREFERENCE_KEY)
        .maybeSingle<{ preference_value: Json }>();

      if (error) throw error;

      const pref = parsePreference(data?.preference_value);
      let avatarUrl: string | null = null;

      if (pref.avatarPath) {
        const { data: signed, error: signedError } = await supabase.storage
          .from(PROFILE_AVATAR_BUCKET)
          .createSignedUrl(pref.avatarPath, 60 * 60);
        if (!signedError) {
          avatarUrl = signed?.signedUrl ?? null;
        }
      }

      return {
        color: pref.color,
        avatarPath: pref.avatarPath,
        avatarUrl,
        emoji: pref.emoji
      };
    },
    staleTime: 1000 * 60 * 15
  });
}
