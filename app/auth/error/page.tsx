type AuthErrorPageProps = {
  searchParams?: {
    reason?: string;
    next?: string;
  };
};

const reasonLabel: Record<string, string> = {
  missing_handoff_secret: 'Intranätet saknar server-hemlighet för handoff.',
  handoff_consume_failed: 'Intranätet kunde inte konsumera handoff-koden från login-appen.',
  session_not_established: 'Intranätet kunde inte etablera en lokal session efter callback.',
  auth_context_missing: 'Session finns, men auth-context kunde inte läsas efter callback.',
  callback_failed: 'Auth-callbacken misslyckades.'
};

export default function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const reason = searchParams?.reason ?? 'callback_failed';
  const next = typeof searchParams?.next === 'string' && searchParams.next.startsWith('/')
    ? searchParams.next
    : '/';

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">Inloggningen kunde inte slutföras</h1>
      <p className="text-sm text-foreground/70">{reasonLabel[reason] ?? 'Okänt auth-fel.'}</p>
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p><strong>Reason:</strong> {reason}</p>
        <p><strong>Next:</strong> {next}</p>
      </div>
    </main>
  );
}
