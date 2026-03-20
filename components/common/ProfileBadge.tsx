'use client';

import { CircleUserRound } from 'lucide-react';
import { buildUserInitials, DEFAULT_PROFILE_BADGE_COLOR } from '@/features/profile/profileBadge';

export default function ProfileBadge({
  label,
  color,
  avatarUrl,
  emoji,
  className = '',
  textClassName = '',
  fallbackIcon = false
}: {
  label?: string | null;
  color?: string | null;
  avatarUrl?: string | null;
  emoji?: string | null;
  className?: string;
  textClassName?: string;
  fallbackIcon?: boolean;
}) {
  const safeLabel = typeof label === 'string' && label.trim() ? label : null;
  const resolvedColor = typeof color === 'string' && color.trim() ? color : DEFAULT_PROFILE_BADGE_COLOR;
  const imageUrl = typeof avatarUrl === 'string' && avatarUrl.trim() ? avatarUrl : undefined;
  const emojiValue = typeof emoji === 'string' && emoji.trim() ? emoji : undefined;
  const showImage = Boolean(imageUrl);
  const showEmoji = Boolean(emojiValue);

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-slate-500 text-white ${textClassName} ${className}`.trim()}
      style={{ backgroundColor: showImage ? undefined : resolvedColor }}
      title={safeLabel ?? undefined}
    >
      {showImage ? (
        <img src={imageUrl} alt={safeLabel ?? 'Profil'} className="h-full w-full object-cover" />
      ) : showEmoji ? (
        <span aria-hidden className="text-[0.95em] leading-none">
          {emojiValue}
        </span>
      ) : fallbackIcon && !safeLabel ? (
        <CircleUserRound className="h-4 w-4" />
      ) : (
        buildUserInitials(safeLabel)
      )}
    </span>
  );
}
