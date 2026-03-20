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
  const resolvedColor = color?.trim() ? color : DEFAULT_PROFILE_BADGE_COLOR;
  const imageUrl = avatarUrl ?? undefined;
  const emojiValue = emoji ?? undefined;
  const showImage = Boolean(imageUrl);
  const showEmoji = Boolean(emojiValue);

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full bg-slate-500 text-white ${textClassName} ${className}`.trim()}
      style={{ backgroundColor: showImage ? undefined : resolvedColor }}
      title={label ?? undefined}
    >
      {showImage ? (
        <img src={imageUrl} alt={label ?? 'Profil'} className="h-full w-full object-cover" />
      ) : showEmoji ? (
        <span aria-hidden className="text-[0.95em] leading-none">
          {emojiValue}
        </span>
      ) : fallbackIcon && !label ? (
        <CircleUserRound className="h-4 w-4" />
      ) : (
        buildUserInitials(label)
      )}
    </span>
  );
}
