#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const testFile = process.argv[2];
if (!testFile) {
  console.error('Missing SQL test path. Usage: node scripts/run-finance-sql-test.mjs <sql-file>');
  process.exit(1);
}

const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('Missing SUPABASE_DB_URL (or DATABASE_URL).');
  process.exit(1);
}

const result = spawnSync(
  'psql',
  [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', testFile],
  { stdio: 'inherit', shell: true }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
