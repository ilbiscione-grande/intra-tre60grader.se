'use client';

import type { Role } from '@/lib/types';

export default function RoleGate({
  role,
  allow,
  children,
  fallback
}: {
  role: Role;
  allow: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  if (!allow.includes(role)) {
    return <>{fallback ?? <p className="rounded-lg bg-muted p-4 text-sm">Du saknar behörighet.</p>}</>;
  }

  return <>{children}</>;
}