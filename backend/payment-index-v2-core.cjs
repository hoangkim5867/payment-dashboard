'use strict';
// Necessary coarse CONTRACT candidate key, never a final duplicate result.
// The original contract normalization removes punctuation and may INSERT
// one ASCII '1' in the EATON PARK P -> P1 alias. Removing every '1' from
// the digit signature makes this candidate key invariant under that alias.
// PHU HUNG -> PH and other aliases do not add/remove any other ASCII digit.
// Therefore an exact original contract match ALWAYS has the same V2 key;
// unrelated contracts may collide and are removed by the unchanged matcher.
function contractDigitsV2(value) {
  return String(value ?? '').replace(/[^0-9]/g,'').replace(/1/g,'');
}
function computeIndexV2(payment) {
  return {contractDigitsV2:contractDigitsV2(payment?.contractNo)};
}
function hasValidIndexV2(payment) {
  return payment?.contractDigitsV2 === contractDigitsV2(payment?.contractNo);
}
module.exports={contractDigitsV2,computeIndexV2,hasValidIndexV2};
