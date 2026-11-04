// Coarse contract-number candidate only. The existing Project+Contract+IPC
// matcher decides duplicates. Match backend/payment-index-v2-core.cjs.
export function contractDigitsV2(value) {
  // Drop digit 1 because the original EATON PARK P -> P1 alias inserts it.
  return String(value ?? '').replace(/[^0-9]/g,'').replace(/1/g,'');
}
export function computeIndexV2(payment) {
  return {contractDigitsV2:contractDigitsV2(payment?.contractNo)};
}
