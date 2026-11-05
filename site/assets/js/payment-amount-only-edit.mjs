// Pure helper for a narrowly scoped amount edit. Never reconstruct a full
// Payment document or infer the baseline from a freshly reloaded form.
export function buildAmountOnlyPatch(payment, rawAmount, nonce) {
  if (!payment || typeof payment !== 'object') return null;
  if(typeof nonce!=='string' || !/^[0-9a-f-]{36}$/i.test(nonce))return null;
  const original = payment.amount;
  const next = Number(String(rawAmount ?? '').replace(/[,\s]/g, ''));
  if (!Number.isFinite(next) || next <= 0 || !Number.isSafeInteger(next)) return null;
  if (Number(original) === next) return null;
  if (typeof original !== 'number' && typeof original !== 'string') return null;
  return {
    amount: next,
    // Firestore Rules compare this against the stored amount without an SDK
    // transaction/getDoc, rejecting stale financial edits.
    amountEditGuard: {baseAmount: original, nonce}
  };
}

/**
 * Fast path is allowed ONLY when the reconstructed Save form has no changes
 * other than the amount. Keep the old guarded transaction for every other
 * edit, including a Contract-derived field changing unexpectedly.
 */
export function buildAmountOnlyFormPatch(previous, form, nonce) {
  if(!previous || !form || typeof previous!=='object' || typeof form!=='object')return null;
  const patch=buildAmountOnlyPatch(previous,form.amount,nonce);
  if(!patch)return null;
  for(const [field,value] of Object.entries(form)){
    if(field==='amount')continue;
    const before=previous[field];
    if(value===before)continue;
    if((value==='' || value==null) && (before==='' || before==null))continue;
    if(typeof value==='number' && typeof before==='number' && Object.is(value,before))continue;
    return null;
  }
  return patch;
}
