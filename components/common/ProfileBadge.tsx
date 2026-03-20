'use client';

import { CircleUserRound } from 'lucide-react';
import { buildUserInitials } from '@/features/profile/profileBadge';

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
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-full ${textClassName} ${className}`.trim()}
      style={{ backgroundColor: avatarUrl || emoji ? undefined : color ?? undefined }}
      title={label ?? undefined}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={label ?? 'Profil'} className="h-full w-full object-cover" />
      ) : emoji ? (
        <span aria-hidden>{emoji}</span>
      ) : fallbackIcon && !label ? (
        <CircleUserRound className="h-4 w-4" />
      ) : (
        buildUserInitials(label)
      )}
    </span>
  );
}
