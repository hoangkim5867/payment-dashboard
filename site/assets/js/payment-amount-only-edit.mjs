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
