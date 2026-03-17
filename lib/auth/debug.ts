export function isAuthDebugEnabled(input: URL | { searchParams?: URLSearchParams }) {
  return input.searchParams?.get('auth_debug') === '1' || process.env.AUTH_DEBUG === '1';
}
