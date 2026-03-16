'use client';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export default function UserMenu({ userEmail }: { userEmail?: string }) {
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
        <Button variant="secondary" size="sm">
          {userEmail ?? 'Användare'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => (window.location.href = '/settings')}>Inställningar</DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>Logga ut</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
