'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { InternalAuthRole } from '@/lib/types';

export type MfaFactor = {
  id: string;
  friendly_name?: string | null;
  factor_type?: string;
  status?: string;
};

export type MfaStatus = {
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  verifiedFactors: MfaFactor[];
  unverifiedFactors: MfaFactor[];
};

export function useMfaStatus(enabled = true) {
  const supabase = useMemo(() => createClient(), []);

  return useQuery<MfaStatus>({
    queryKey: ['mfa-status'],
    queryFn: async () => {
      const [aalResult, factorsResult] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors()
      ]);

      if (aalResult.error) throw aalResult.error;
      if (factorsResult.error) throw factorsResult.error;

      const factors = (factorsResult.data?.all ?? []) as MfaFactor[];

      return {
        currentLevel: aalResult.data?.currentLevel ?? null,
        nextLevel: aalResult.data?.nextLevel ?? null,
        verifiedFactors: factors.filter((factor) => factor.status === 'verified'),
        unverifiedFactors: factors.filter((factor) => factor.status !== 'verified')
      };
    },
    enabled
  });
}

export function getInternalRoleLabel(role: InternalAuthRole) {
  return role === 'admin' ? 'Admin' : 'Medarbetare';
}
