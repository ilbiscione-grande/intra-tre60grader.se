'use client';

import RoleGate from '@/components/common/RoleGate';
import { useAppContext } from '@/components/providers/AppContext';
import VerificationWizard from '@/features/finance/VerificationWizard';

export default function NewVerificationPage() {
  const { role, companyId } = useAppContext();

  return (
    <RoleGate role={role} allow={['finance', 'admin']}>
      <VerificationWizard companyId={companyId} />
    </RoleGate>
  );
}