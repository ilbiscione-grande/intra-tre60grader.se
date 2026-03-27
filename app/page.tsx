import { redirect } from 'next/navigation';
import { getAuthContext, getLoginRedirectUrl, isStaff } from '@/lib/auth/authContext';

export default async function HomePage() {
  const authContext = await getAuthContext();

  if (!isStaff(authContext)) {
    redirect(getLoginRedirectUrl(authContext, '/todo'));
  }

  redirect('/todo');
}
