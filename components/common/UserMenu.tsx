'use client';

import { CircleUserRound } from 'lucide-react';
import CompanySwitcher from '@/components/common/CompanySwitcher';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

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
  async function signOut() {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success('Utloggad');
    window.location.href = '/login';
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
        <div className="my-1 rounded-md border border-border/70 bg-muted/20 p-2">
          <p className="mb-2 px-1 text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">Aktivt bolag</p>
          <CompanySwitcher />
        </div>
        <DropdownMenuItem onClick={() => (window.location.href = '/settings')}>Inställningar</DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>Logga ut</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
