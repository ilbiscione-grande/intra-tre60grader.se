'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ShieldAlert } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import { Button } from '@/components/ui/button';
import { useMfaStatus } from '@/features/security/mfa';

export default function MfaReminder() {
  const { authRole } = useAppContext();
  const mfaStatusQuery = useMfaStatus(true);

  if (mfaStatusQuery.isLoading || mfaStatusQuery.isError) {
    return null;
  }

  if ((mfaStatusQuery.data?.verifiedFactors ?? []).length > 0) {
    return null;
  }

  return (
    <div className="mb-4 flex items-start justify-between gap-4 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Tvåstegsverifiering rekommenderas</p>
          <p className="mt-1 text-amber-900/85">
            Ditt interna {authRole === 'admin' ? 'adminkonto' : 'medarbetarkonto'} saknar aktiv TOTP-verifiering.
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="border-amber-400 bg-white hover:bg-amber-100">
        <Link href={'/settings/security' as Route}>Aktivera MFA</Link>
      </Button>
    </div>
  );
}
