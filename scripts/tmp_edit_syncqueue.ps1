$ErrorActionPreference = 'Stop'
$path = 'features/offline/syncQueue.ts'
$raw = Get-Content -LiteralPath $path -Raw
$pattern = 'async function runProjectAction\(action: QueueAction\) \{[\s\S]*?\n\}\r?\n\r?\nexport async function processQueue'
if (-not [regex]::IsMatch($raw, $pattern)) {
  throw 'pattern not found'
}
$replacement = @"
async function runQueuedAction(action: QueueAction) {
  if (action.type === 'CREATE_PROJECT') {
    const payload = action.payload as ProjectCreatePayload;
    const resolved = await resolveCustomerForPayload(action.company_id, payload);
    await createProjectWithOrder(resolved);
    await markAction(action.id, 'done');
    return;
  }

  if (action.type === 'BOOK_INVOICE_ISSUE') {
    const invoiceId = typeof action.payload.invoice_id === 'string' ? action.payload.invoice_id : '';
    if (!invoiceId) {
      throw new Error('invoice_id saknas i koead fakturaatgaerd');
    }

    await bookInvoiceIssue(invoiceId);
    await markAction(action.id, 'done');
    return;
  }

  if (action.type === 'REGISTER_INVOICE_PAYMENT') {
    const invoiceId = typeof action.payload.invoice_id === 'string' ? action.payload.invoice_id : '';
    const amount = Number(action.payload.amount);
    const paymentDate = typeof action.payload.payment_date === 'string' ? action.payload.payment_date : '';
    const method = typeof action.payload.method === 'string' ? action.payload.method : undefined;
    const reference = typeof action.payload.reference === 'string' ? action.payload.reference : undefined;
    const note = typeof action.payload.note === 'string' ? action.payload.note : undefined;
    const allowOverpayment = Boolean(action.payload.allow_overpayment);

    if (!invoiceId || !Number.isFinite(amount) || amount <= 0 || !paymentDate) {
      throw new Error('Ogiltig payload for koead betalningsregistrering');
    }

    await registerInvoicePayment(
      invoiceId,
      amount,
      paymentDate,
      method,
      reference,
      note,
      allowOverpayment,
      undefined
    );

    await markAction(action.id, 'done');
    return;
  }

  if (!action.project_id) {
    throw new Error('project_id saknas i action');
  }

  const conflict = await hasConflict(action.project_id, action.baseUpdatedAt);
  if (conflict) {
    await markAction(action.id, 'conflict', 'Serverversionen ar nyare an lokal basversion');
    return;
  }

  if (action.type === 'SET_PROJECT_STATUS') {
    await setProjectStatus(action.project_id, toProjectStatus(action.payload.to_status));
    await markAction(action.id, 'done');
    return;
  }

  if (action.type === 'MOVE_PROJECT') {
    await moveProject(
      action.project_id,
      toProjectStatus(action.payload.to_status),
      Number(action.payload.to_position)
    );
    await markAction(action.id, 'done');
    return;
  }
}

export async function processQueue"@
$raw = [regex]::Replace($raw, $pattern, $replacement)
$raw = $raw -replace 'await runProjectAction\(action\);', 'await runQueuedAction(action);'
Set-Content -LiteralPath $path -Value $raw -NoNewline
Write-Output 'ok'
