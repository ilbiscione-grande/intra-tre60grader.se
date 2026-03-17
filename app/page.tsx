import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/getSession';
import { getAuthContext, getLoginRedirectUrl, isStaff } from '@/lib/auth/authContext';

export default async function HomePage({
  searchParams
}: {
  searchParams?: { auth_debug?: string };
}) {
  const authContext = await getAuthContext();
  const session = await getSession();

  if (searchParams?.auth_debug === '1' || process.env.AUTH_DEBUG === '1') {
    return (
      <pre style={{ padding: '24px', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(
          {
            stage: 'root_page',
            session_user_id: session?.user.id ?? null,
            auth_context: authContext,
            is_staff: isStaff(authContext),
            redirect_to: !isStaff(authContext) ? getLoginRedirectUrl(authContext, '/projects') : '/projects'
          },
          null,
          2
        )}
      </pre>
    );
  }

  if (!isStaff(authContext)) {
    redirect(getLoginRedirectUrl(authContext, '/projects'));
  }

  redirect('/projects');
}
