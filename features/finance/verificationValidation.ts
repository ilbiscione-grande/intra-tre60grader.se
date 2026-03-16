import type { VerificationDraft } from '@/lib/types';

function cents(value: number) {
  return Math.round(Number(value) * 100);
}

function isAccountNo(value: string) {
  return /^\d{4,}$/.test(value.trim());
}

export function validateVerificationDraft(draft: VerificationDraft) {
  const errors: string[] = [];
  const totalCents = cents(draft.total);

  if (!draft.date) errors.push('Datum saknas.');
  if (!draft.description?.trim()) errors.push('Beskrivning saknas.');
  if (!Number.isFinite(draft.total) || totalCents <= 0) errors.push('Belopp måste vara större än 0.');
  if (!draft.lines || draft.lines.length < 2) errors.push('Minst två konteringsrader krävs.');

  let debitCents = 0;
  let creditCents = 0;
  let vatLineCount = 0;

  draft.lines.forEach((line, index) => {
    const debit = cents(line.debit);
    const credit = cents(line.credit);

    debitCents += debit;
    creditCents += credit;

    if (!isAccountNo(line.account_no)) {
      errors.push(`Rad ${index + 1}: kontonummer måste vara minst fyra siffror.`);
    }

    if (debit < 0 || credit < 0) {
      errors.push(`Rad ${index + 1}: debet/kredit får inte vara negativt.`);
    }

    if (debit === 0 && credit === 0) {
      errors.push(`Rad ${index + 1}: raden måste ha debet eller kredit.`);
    }

    if (debit > 0 && credit > 0) {
      errors.push(`Rad ${index + 1}: en rad kan inte ha både debet och kredit.`);
    }

    if (line.vat_code) {
      vatLineCount += 1;
      if (!['0', '6', '12', '25'].includes(line.vat_code)) {
        errors.push(`Rad ${index + 1}: ogiltig momskod.`);
      }
    }
  });

  if (debitCents !== creditCents) {
    errors.push('Debet och kredit balanserar inte.');
  }

  if (vatLineCount > 1) {
    errors.push('Endast en momsrad stöds i guiden just nu.');
  }

  return {
    ok: errors.length === 0,
    errors,
    totals: {
      debit: debitCents / 100,
      credit: creditCents / 100
    }
  };
}
