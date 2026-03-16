# Finance testpaket (B6)

Detta paket innehåller två SQL-testfiler:

1. `20260305_finance_rpc_smoke.sql`
- smoke för idempotency, makulering, rättelse och periodlås.

2. `20260307_finance_golden_tests.sql`\n- golden-scenarier med deterministiska assertions för:\n  - momsrutor (05/10/20/48/49)\n  - leverantörsreskontra (skapa leverantörsfaktura + betalning)\n  - revisionskedja (verify + export)\n\n3. `20260307_permissions_smoke_b8.sql`\n- behörighetsmatris för action-baserade regler (admin vs finance).

Båda kör i `BEGIN ... ROLLBACK` och lämnar ingen testdata kvar.

## Körning lokalt

Förutsätter att `psql` finns installerat och att `SUPABASE_DB_URL` är satt.

```bash
npm run test:finance:smoke
npm run test:finance:golden
# eller
npm run test:finance:all\nnpm run test:permissions:smoke
```

## CI-smoke

Workflow: `.github/workflows/finance-smoke.yml`

Kräver secret i GitHub:
- `SUPABASE_DB_URL` (Postgres connection string till din Supabase-db)

När secret finns kör workflow automatiskt SQL-smoke + golden.

