
// Pure shared lookup logic, ported verbatim in behavior from Payment HTML
// and Contract Master MEP selection. Keep in sync with both legacy functions.
function normalize(value){
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D').trim().toLowerCase().replace(/\s+/g,' ');
}
function normalizeSmartText(value){
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim()
    .replace(/\bcty\b/g,'cong ty').replace(/\bct\b/g,'cong ty')
    .replace(/\bco\.?\b/g,'company').replace(/\bltd\.?\b/g,'limited')
    .replace(/\s+/g,' ');
}
function normalizeSmartProject(value){
  const normalizedText=normalizeSmartText(value);
  const compact=normalizedText.replace(/[^\p{L}\p{N}]/gu,'');
  if(compact==='ph' || compact.startsWith('phuhung')) return 'phuhung';
  if(compact.startsWith('eaton')) return 'eaton';
  if(compact==='foxconn' || compact==='fscpcb' || normalizedText.includes('中建厂房')) return 'foxconn';
  return compact;
}
function normalizeSmartContractNo(value){
  let compact=normalizeSmartText(value).replace(/[^a-z0-9]/g,'');
  compact=compact.replace(/eatonparkp(?=mep)/g,'eatonparkp1').replace(/phuhung(?=mep)/g,'ph');
  return compact;
}
function duplicateKeyV1(p){
  return normalizeSmartProject(p?.project)+'||'+normalizeSmartContractNo(p?.contractNo)+'||'+normalize(p?.ipcNo);
}
function normalizeMEPSearch(value){ return normalize(value); }
function isMissingMEPCode(value){return ['','-','—','–','NA','N/A','NONE','NULL'].includes(String(value||'').trim().toUpperCase());}
function getMEPRawCode(payment){
  return String([payment?.contractNo,payment?.budgetNo,payment?.ipcNo].find(v=>!isMissingMEPCode(v))||'').trim();
}
function isMEPHistoryPayment(payment){
  if(!payment || payment.deleted===true)return false;
  const paymentType=normalizeMEPSearch(payment.paymentType);
  if(paymentType==='other'||paymentType==='mep')return true;
  if(payment.noMEPException===true || String(payment.internalExpenseCode||'').toUpperCase().startsWith('NMEP-'))return true;
  return !payment.contractId && /^MEP[\s_-]*\d+/i.test(getMEPRawCode(payment));
}
function computeIndexV1(p){return {duplicateKeyV1:duplicateKeyV1(p),mepLookupV1:isMEPHistoryPayment(p),paymentLookupSchemaV1:1};}
function needsIndexRepair(p){const expected=computeIndexV1(p);return Object.keys(expected).some(k=>p?.[k]!==expected[k]);}
export {normalize,normalizeSmartText,normalizeSmartProject,normalizeSmartContractNo,duplicateKeyV1,normalizeMEPSearch,isMEPHistoryPayment,computeIndexV1,needsIndexRepair};

