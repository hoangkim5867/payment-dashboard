// Candidate-only key. Final duplicate decision remains original normalization
// of Project + Contract + IPC. Must match backend/payment-index-v2-core.cjs
export function ipcDigitsV2(value) {
  return String(value ?? '').replace(/[^0-9]/g,'');
}
export function computeIndexV2(payment) {
  return {ipcDigitsV2:ipcDigitsV2(payment?.ipcNo)};
}
