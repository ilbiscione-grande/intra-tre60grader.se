import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export async function getSession(): Promise<{ user: User } | null> {
  const supabase = createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Keep existing call sites intact while using verified user data.
  return { user };
}
