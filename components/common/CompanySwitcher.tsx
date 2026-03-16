'use client';

import { useAppContext } from '@/components/providers/AppContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { Role } from '@/lib/types';

const roleLabel: Record<Role, string> = {
  member: 'Medlem',
  finance: 'Ekonomi',
  admin: 'Admin',
  auditor: 'Revisor'
};

export default function CompanySwitcher({ compact = false }: { compact?: boolean }) {
  const { companyId, companies } = useAppContext();

  return (
    <div className={compact ? 'w-[170px]' : 'w-[250px]'}>
      <Select
        value={companyId}
        onValueChange={(value) => {
          document.cookie = `active_company_id=${value}; path=/; max-age=31536000; samesite=lax`;
          window.location.reload();
        }}
      >
        <SelectTrigger className={compact ? 'h-9 text-xs' : undefined}>
          <SelectValue placeholder="Välj bolag" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((company) => (
            <SelectItem key={company.companyId} value={company.companyId}>
              {company.companyName} ({roleLabel[company.role]})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}