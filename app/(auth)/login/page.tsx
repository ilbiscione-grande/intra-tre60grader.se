import { redirect } from 'next/navigation';
import { getLoginRedirectUrl } from '@/lib/auth/authContext';

export default function LoginPage({
  searchParams
}: {
  searchParams?: { redirect?: string };
}) {
  const returnTo =
    typeof searchParams?.redirect === 'string' && searchParams.redirect.startsWith('/')
      ? searchParams.redirect
      : '/projects';

  redirect(getLoginRedirectUrl(null, returnTo));
}
