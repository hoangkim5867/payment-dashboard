'use strict';
// Necessary (coarse) duplicate candidate key, NEVER a final duplicate decision.
// The original normalize() can remove case/spacing/diacritics but preserves
// ASCII digits. Thus normalized IPC equality => equal ascii-digit sequence.
// This intentionally overselects candidates (e.g. IPC001 and MEP001) and
// never replaces the existing Project + Contract + IPC comparisons.
function ipcDigitsV2(value) {
  return String(value ?? '').replace(/[^0-9]/g,'');
}
function computeIndexV2(payment) {
  return {ipcDigitsV2:ipcDigitsV2(payment?.ipcNo)};
}
function hasValidIndexV2(payment) {
  return payment?.ipcDigitsV2 === ipcDigitsV2(payment?.ipcNo);
}
module.exports={ipcDigitsV2,computeIndexV2,hasValidIndexV2};
