// Return a minimal, index-neutral patch only for a strictly bank-only edit.
// A conservative comparison falls back to the existing guarded transaction
// if ANY other field has changed (including fields rebuilt from Contract).
export function buildBankOnlyPaymentPatch(previous, form) {
  if(!previous || !form || typeof previous!=='object' || typeof form!=='object')return null;
  if(typeof form.bankAccount!=='string' || form.bankAccount===String(previous.bankAccount??''))return null;
  for(const [field,value] of Object.entries(form)) {
    if(field==='bankAccount')continue;
    const before=previous[field];
    if(value===before)continue;
    // Old rows may encode blank optional fields as missing or null.
    if((value==='' || value==null) && (before==='' || before==null))continue;
    if(typeof value==='number' && typeof before==='number' && Object.is(value,before))continue;
    return null;
  }
  return {bankAccount:form.bankAccount};
}
