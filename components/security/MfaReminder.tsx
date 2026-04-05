'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ShieldAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppContext } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';
import { useMfaStatus } from '@/features/security/mfa';
import { clearMfaReminderDismissed, dismissMfaReminder, isMfaReminderDismissed } from '@/features/security/mfaReminder';

export default function MfaReminder() {
  const { authRole } = useAppContext();
  const mfaStatusQuery = useMfaStatus(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(isMfaReminderDismissed());
  }, []);

  if (mfaStatusQuery.isLoading || mfaStatusQuery.isError) {
    return null;
  }

  if ((mfaStatusQuery.data?.verifiedFactors ?? []).length > 0) {
    if (dismissed) {
      clearMfaReminderDismissed();
    }
    return null;
  }

  if (dismissed) {
    return null;
  }

  return (
    <div className="mb-4 flex items-start justify-between gap-4 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Tvåstegsverifiering rekommenderas</p>
          <p className="mt-1 text-amber-900/85 dark:text-amber-100/80">
            Ditt interna {authRole === 'admin' ? 'adminkonto' : 'medarbetarkonto'} saknar aktiv TOTP-verifiering.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          asChild
          size="sm"
          variant="outline"
          className="border-amber-400 bg-white hover:bg-amber-100 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-50 dark:hover:bg-amber-900/40"
        >
          <Link href={'/settings/security' as Route}>Aktivera MFA</Link>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9 rounded-full text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900/30"
          aria-label="Stäng MFA-påminnelse"
          onClick={() => {
            dismissMfaReminder();
            setDismissed(true);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
