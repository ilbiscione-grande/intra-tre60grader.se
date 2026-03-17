# Projectify + Bookie (Next.js + Supabase)

## Stack

- Next.js 14 App Router + TypeScript
- Tailwind CSS
- Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- TanStack Query + IndexedDB persistence
- dnd-kit (desktop board)
- Zod + react-hook-form
- next-pwa + Workbox
- idb + Zustand

## Environment

Skapa `.env.local` med:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.tre60grader.se
SUPABASE_SERVICE_ROLE_KEY=...
LOGIN_APP_HANDOFF_SECRET=...
NEXT_PUBLIC_LOGIN_APP_URL=https://login.tre60grader.se
SECURITY_ALERT_WEBHOOK_URL=...
```

Notera:

- `NEXT_PUBLIC_*` exponeras i klienten.
- Intranätets auth-guard använder `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` och session-cookies för att anropa `tre60_auth_context()` server-side.
- `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.tre60grader.se` måste vara samma i både login-appen och intranätet om sessionen ska delas mellan subdomäner.
- `SUPABASE_SERVICE_ROLE_KEY` är server-only och får aldrig användas i client components. Den behövs fortfarande för separata admin/säkerhetsfunktioner i detta repo, men inte för intranätets vanliga auth-guard.
- `LOGIN_APP_HANDOFF_SECRET` är server-only och används när intranätet byter in `handoff` mot sessionpayload via login-appens `/api/handoff/consume`.
- `NEXT_PUBLIC_LOGIN_APP_URL` är URL:en till den gemensamma login-appen för Tre60 Grader.
- `SECURITY_ALERT_WEBHOOK_URL` är valfri och används för att skicka webhook-larm på kritiska säkerhetshändelser.

## Kör lokalt

```bash
npm install
npm run dev
```

Öppna `http://localhost:3000`.

## Deploy via Git + Vercel

Repo:t är förberett för git-baserad deployment till ett separat Vercel-projekt för intranätet.

Föreslagen setup:

- Vercel-projekt: detta repo
- Domän: `intra.tre60grader.se`
- Separat från login-projektet på `login.tre60grader.se`

Miljövariabler i Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.tre60grader.se
NEXT_PUBLIC_LOGIN_APP_URL=https://login.tre60grader.se
SUPABASE_SERVICE_ROLE_KEY=...
LOGIN_APP_HANDOFF_SECRET=...
SECURITY_ALERT_WEBHOOK_URL=...
```

Git-flöde:

```bash
git init
git add .
git commit -m "Prepare intranet app for Vercel deployment"
git branch -M main
git remote add origin <din-git-url>
git push -u origin main
```

I Vercel:

1. Importera git-repot som nytt projekt.
2. Bekräfta att framework är `Next.js`.
3. Lägg in miljövariablerna ovan.
4. Lägg till domänen `intra.tre60grader.se`.
5. Peka DNS för subdomänen enligt Vercels instruktioner.

## Databas-migrationer (viktigt)

Kör SQL-filer i Supabase SQL Editor.

Ny databas (fran noll):

1. `supabase/migrations/20260303_000001_init_schema.sql`
2. `supabase/migrations/20260303_add_customers_archived_at.sql` (safe no-op om kolumnen redan finns)
3. `supabase/migrations/20260304_000002_move_project_reorder.sql`
4. `supabase/migrations/20260304_000003_invoice_history.sql`
5. `supabase/migrations/20260304_000004_company_profile_fields.sql`
6. `supabase/migrations/20260304_000005_invoices_and_numbering.sql`
7. `supabase/migrations/20260304_000006_project_columns.sql`
8. `supabase/migrations/20260305_000007_user_company_preferences.sql`
9. `supabase/migrations/20260305_000008_verifications_audit_and_storage.sql`
10. `supabase/migrations/20260305_000009_verification_idempotency_and_void.sql`
11. `supabase/migrations/20260305_000010_verification_reversal_lock_and_numbering.sql`
12. `supabase/migrations/20260306_000011_accounting_core_and_auditor.sql`

Befintlig databas: kör alla migrationer som saknas i datumordning.

## Seed-data (demo)

Kör valfritt:

- `supabase/seed.sql`

Detta skapar demo-bolag, kunder, projekt, ordrar och verifikationer.
Skriptet försöker även ge alla befintliga `auth.users` medlemskap i demo-bolagen.

## PWA-installation

1. Kör appen i production mode (`npm run build && npm run start`).
2. Öppna i Chrome.
3. Klicka Installera app i adressfältets install-ikon.

## Offline-test (Chrome)

1. Öppna appen och navigera runt så data cachas.
2. Öppna DevTools -> Network.
3. Sätt throttling till `Offline`.
4. Gör project-ändringar i mobile/desktop och verifiera att actions köas.
5. Gå till `/sync` för att se queue/conflicts/failed.
6. Återgå online och verifiera auto-sync.

## Behörighet

- `member`: Projects + Customers + Sync
- `finance/admin`: får även Finance + Reports + Invoices
- Middleware blockerar `/finance`, `/reports` och `/invoices` för `member`.

## Säkerhet (C4 pågår)

- Login använder nu serverrouten `/api/auth/request-link` i stället för direkt klientkall.
- Magic-link-inloggning har serverstyrd rate limiting per IP och per e-post.
- Känsliga admin-API:er kräver antingen `aal2` (MFA verifierad session) eller färsk inloggning (`last_sign_in_at` inom 30 minuter) som fallback.
- Säkerhetshändelser loggas i `security_events`.
- Admin kan se bolagets senaste säkerhetshändelser och enkla larm på `/settings`.
- Admin kan aktivera TOTP-MFA på `/settings` och verifiera aktuell session till `aal2`.
- Kritiska säkerhetshändelser kan skickas till extern webhook via `SECURITY_ALERT_WEBHOOK_URL`.
- Ny migration: `supabase/migrations/20260309_000041_c4_security_ops.sql`

## Multi-tenant

- Aktivt bolag styrs av cookie `active_company_id`.
- Company switcher i header uppdaterar cookie och laddar om appen.
- Alla queries använder aktivt `company_id` från app-context.

## Offline och sync

- Projects actions köas offline: `CREATE_PROJECT`, `SET_PROJECT_STATUS`, `MOVE_PROJECT`.
- Konfliktdetektering jämför `server.updated_at` mot `baseUpdatedAt` innan RPC.
- Konflikt markeras som `conflict` och skrivs inte över.
- Verifikationer sparas som drafts offline och skickas manuellt online.
- Bilagor laddas upp till Supabase Storage-bucket `verification-attachments` vid skickning online.
- Verifikationer sparar revisionsspår: `created_by`, `source`, `created_at`.
- Idempotency skydd: `client_request_id` förhindrar dubletter vid upprepad submit/sync.
- Verifikationer kan makuleras (status `voided`) utan att historik skrivs över.
- Rättelseverifikation kan skapas som motbokning via `create_reversal_verification`.
- Periodlås stöds via `companies.locked_until` (hindrar bokning/makulering i låst period).
- Verifikationsnummer skapas per bolag och räkenskapsår (`fiscal_year` + `verification_no`).
- SIE4-light export finns på `/api/verifications/sie` (via Rapporter) och inkluderar företagsmetadata, kontolista och verifikationer.

## Fakturor och export

- Fakturanummer genereras server-side via säker sekvens per bolag (`next_invoice_number`).
- `create_invoice_from_order` skapar nu en riktig post i `invoices` med snapshot (företag/kund/rader).
- JSON-export: `/api/invoices/[id]/export`.
- PDF-export: öppna `/invoices/[id]/print` och spara som PDF via browser print-dialog.

## Dynamiska projektkolumner

- Kolumner lagras per bolag i `project_columns` (`key`, `title`, `position`).
- På `/projects` kan du lägga till, byta namn och ta bort kolumner.
- Vid borttagning flyttas projekt i kolumnen automatiskt till en reservkolumn innan kolumnen tas bort.

## SQL-smoketest (ekonomi)

Kör `supabase/tests/20260305_finance_rpc_smoke.sql` i Supabase SQL Editor för att verifiera:

- idempotency (`client_request_id`)
- makulering
- rättelseverifikation
- periodlås

Skriptet kör i `BEGIN ... ROLLBACK` och lämnar ingen testdata kvar.

## Accounting Core (intern bokföring)

- Kontoplan lagras i `chart_of_accounts` per bolag.
- Huvudboksrader materialiseras i `ledger_entries` vid bokföring/rättelse/makulering.
- Rapport-RPC finns för huvudbok, saldobalans, resultat och balansrapport.
- Periodstängning hanteras via RPC `set_period_lock` och loggas i `finance_audit_log`.
- Ny roll `auditor` kan läsa ekonomi/rapporter/export men saknar mutationsrättigheter.

## A1-migration (fakturainnehåll)

Kör även:

- `supabase/migrations/20260307_000017_invoice_compliance_a1.sql`

Detta lägger till compliance-fält för företag/kunder/fakturor och uppdaterar faktura-RPC för bättre juridiskt innehåll i fakturor.

- `supabase/migrations/20260307_000018_vat_logic_v2.sql` (A2 momslogik v2)

- supabase/migrations/20260307_000019_period_lock_and_integrity_a3.sql (A3 periodlås + integritet)
- supabase/migrations/20260307_000020_retention_backup_restore_a5.sql (A5 retention + backup/restore-test)

## Backup och retention

- Ny adminsektion på /settings: skapa backup-snapshot, kör återläsningstest, ladda ner backup-JSON.
- Default retention är 7 år och kan höjas till max 15 år via retention-policy.
- Legal hold blockerar backup-radering tills hold tas bort.
- Återläsningstest är icke-destruktivt och verifierar checksumma + struktur + radantal.

- supabase/migrations/20260307_000021_a5_digest_public_shim.sql (A5 hotfix: digest i public schema)

- supabase/migrations/20260307_000022_a5_created_at_ambiguous_fix.sql (A5 hotfix: created_at ambiguous)

- supabase/migrations/20260307_000023_a5_log_finance_event_compat.sql (A5 hotfix: log_finance_event kompatibilitet)

- supabase/migrations/20260307_000024_bank_reconciliation_b3.sql (B3 bankavstämning: import + auto-match)

## Bankavstämning

- Öppna /finance och använd kortet **Bankavstämning**.
- Importera CSV med kolumner för datum + belopp (stöd för olika rubriknamn).
- Kör **Kör auto-match** för att få förslag mot öppna kundfakturor.
- Bekräfta match för att automatiskt registrera inbetalning via
  egister_invoice_payment.
- Avvisa match för att lämna transaktionen omatchad.

- supabase/migrations/20260307_000025_b3_activate_required_accounts.sql (B3 hotfix: aktivera 1930/1510)

- supabase/migrations/20260307_000026_b3_confirm_match_account_guard.sql (B3 hotfix: konto-guard vid bekräftad bankmatch)

- supabase/migrations/20260307_000027_b3_confirm_match_include_2420.sql (B3 hotfix: inkludera 2420 i konto-guard)

## B6 Testpaket (ekonomi)

- SQL smoke: `supabase/tests/20260305_finance_rpc_smoke.sql`
- SQL golden: `supabase/tests/20260307_finance_golden_tests.sql`
- Lokala npm-kommandon:
  - `npm run test:finance:smoke`
  - `npm run test:finance:golden`
  - `npm run test:finance:all`

För CI finns workflow: `.github/workflows/finance-smoke.yml`.
Sätt GitHub secret `SUPABASE_DB_URL` för att aktivera SQL-smoke/golden i pipeline.

- Behörighets-smoke (B8):
  - `npm run test:permissions:smoke`

## C1 fakturaflöde (pågår)

- Ny migration: `supabase/migrations/20260307_000036_invoice_flow_c1.sql`
- Lägger till:
  - `invoice_deliveries` (utskick + leveransstatus)
  - `invoice_versions` (versionshistorik per faktura)
  - RPC: `send_invoice(...)`, `update_invoice_delivery_status(...)`, `create_invoice_version_snapshot(...)`
- Fakturasidan (`/invoices/[id]`) har nu:
  - skicka faktura
  - leveranslogg med statusuppdatering
  - versionshistorik
- Smoke-test:
  - `npm run test:invoice-flow:smoke`
  - SQL-fil: `supabase/tests/20260309_invoice_flow_c1_smoke.sql`
