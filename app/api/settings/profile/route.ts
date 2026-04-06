import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PROFILE_BADGE_PREFERENCE_KEY } from '@/lib/profile/constants';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const companyId = typeof body?.companyId === 'string' ? body.companyId : '';
  const color = typeof body?.color === 'string' ? body.color : null;
  const emoji = typeof body?.emoji === 'string' ? body.emoji : null;
  const avatarPath = typeof body?.avatarPath === 'string' ? body.avatarPath : null;
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';

  if (!companyId) {
    return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  if (!membership) {
    return NextResponse.json({ error: 'Ingen åtkomst till bolaget' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { error: profileError } = await (admin as any).from('profiles').upsert(
    {
      id: user.id,
      email: user.email ?? null,
      full_name: displayName || null
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: preferenceError } = await admin.from('user_company_preferences').upsert(
    {
      company_id: companyId,
      user_id: user.id,
      preference_key: PROFILE_BADGE_PREFERENCE_KEY,
      preference_value: {
        color,
        avatar_path: avatarPath,
        emoji,
        display_name: displayName || null
      }
    },
    { onConflict: 'company_id,user_id,preference_key' }
  );

  if (preferenceError) {
    return NextResponse.json({ error: preferenceError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
