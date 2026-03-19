'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { CircleUserRound } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppContext';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import type { Role } from '@/lib/types';

const roleLabel: Record<Role, string> = {
  member: 'Medlem',
  finance: 'Ekonomi',
  admin: 'Admin',
  auditor: 'Revisor'
};

function getFirstName(userEmail?: string) {
  const localPart = userEmail?.split('@')[0]?.trim();
  if (!localPart) return 'Profil';

  const firstToken = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .find(Boolean);

  if (!firstToken) return 'Profil';
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1);
}

export default function UserMenu({ userEmail, compact = false }: { userEmail?: string; compact?: boolean }) {
  const { companyId, companies } = useAppContext();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Utloggad');
    router.replace('/login' as Route);
    router.refresh();
  }

  function switchCompany(nextCompanyId: string) {
    document.cookie = `active_company_id=${nextCompanyId}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size={compact ? 'icon' : 'sm'} className={compact ? 'h-10 w-10 rounded-full' : 'gap-2 rounded-full pl-2 pr-3'}>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/12 text-primary">
            <CircleUserRound className="h-4 w-4" />
          </span>
          {!compact ? <span>{getFirstName(userEmail)}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        {userEmail ? <DropdownMenuItem disabled>{userEmail}</DropdownMenuItem> : null}
        {companies.length > 1 ? (
          <div className="my-1 rounded-md border border-border/70 bg-muted/20 p-1">
            <p className="mb-1 px-2 py-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">Aktivt bolag</p>
            {companies.map((company) => (
              <DropdownMenuCheckboxItem
                key={company.companyId}
                checked={company.companyId === companyId}
                onCheckedChange={() => switchCompany(company.companyId)}
              >
                {company.companyName} ({roleLabel[company.role]})
              </DropdownMenuCheckboxItem>
            ))}
          </div>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={'/help' as Route}>Hjälp</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={'/settings' as Route}>Inställningar</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>Logga ut</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
