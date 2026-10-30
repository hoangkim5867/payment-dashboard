'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

// Evaluate only the pure allocation and reconciliation helpers; never load production Firebase.
const html=fs.readFileSync(path.resolve(__dirname,'../../site/payment.html'),'utf8');
function extract(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'UNC helper missing: '+start);
 return html.slice(a,b);
}
const core=extract('function bulkUncGroupAllocation(payment){','function bulkUncGroupCandidates(){')
 + '\n'+extract('function validateBulkUncGroup(row,payments){','function selectedBulkUncGroupPayments(){');
const context={
  normalize:value=>String(value||'').trim().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase(),
  isPaymentCancelled:p=>!!p.cancelled,
  isPaymentCarriedForward:p=>!!p.carriedForward,
  hasUncDriveFile:p=>!!p.uncDriveFileId,
  bulkUncCompanyScore:(company,beneficiary)=>beneficiary.includes('th vn')?16:0,
  BULK_UNC_GROUP_MAX:40,
  Number,Set,String,Array,Math
};
vm.createContext(context);
vm.runInContext(core,context);
const validate=(row,payments)=>vm.runInContext('validateBulkUncGroup',context)(row,payments);
const payment=(id,ipcNo,amount)=>({
 id,ipcNo,project:'P1',company:'CONG TY THUONG MAI TH VN',
 paymentMonth:'2026-10',contractNo:'TEST-MEP-SUBP-001',amount,
 processActualAmount:'',processPaymentDate:'',bankAccount:'2221168868888'
});
const p1=payment('p1','IPC011',564300000);
const p2=payment('p2','IPC012',1516835100);
const doc=(transfer=2081135100)=>({validPdf:true,info:{
 amount:transfer,remittanceAmount:transfer,debitAmount:2081592950,
 date:'2026-10-29',beneficiary:'CONG TY THUONG MAI TH VN'}});
test('one remitted sum for IPC011+IPC012: fee excluded, original allocations intact',()=>{
 const result=validate(doc(),[p1,p2]);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.total,2081135100);
 assert.equal(result.expected,2081135100);
 assert.equal(vm.runInContext('bulkUncGroupAllocation',context)(p1),564300000);
 assert.equal(vm.runInContext('bulkUncGroupAllocation',context)(p2),1516835100);
});
test('fee-inclusive amount is never valid; debit-only document rejected',()=>{
 assert.equal(validate(doc(2081592950),[p1,p2]).ok,false);
 const debitOnly=doc();
 debitOnly.info.remittanceAmount=NaN;
 debitOnly.info.amount=2081592950;
 assert.match(validate(debitOnly,[p1,p2]).error,/trích nợ/);
});
test('reject a wrong payee, mismatched existing date and different month',()=>{
 assert.equal(validate(doc(),[p1,{...p2,company:'UNRELATED'}]).ok,false);
 assert.equal(validate(doc(),[p1,{...p2,processPaymentDate:'2026-10-28'}]).ok,false);
 assert.equal(validate(doc(),[p1,{...p2,paymentMonth:'2026-09'}]).ok,false);
});
test('reject preexisting UNC, duplicate selected row, wrong amount, one IPC',()=>{
 assert.equal(validate(doc(),[p1,{...p2,uncDriveFileId:'EXISTING'}]).ok,false);
 assert.equal(validate(doc(),[p1,p1]).ok,false);
 assert.equal(validate(doc(),[p1,{...p2,amount:10}]).ok,false);
 assert.equal(validate(doc(),[p1]).ok,false);
});
test('shared UNC guard covers all single-row replacement and delete paths',()=>{
 assert.match(html,/if\(existingFileId && !isSharedUncPayment\(payment\)\)/);
 assert.match(html,/if\(row\.existing && existingFileId && !isSharedUncPayment\(payment\)\)/);
 assert.match(html,/if\(!shared\)\{[\s\S]*?trashed:true/);
 assert.match(html,/await batch\.commit\(\); \/\/ No success or local mutation before Firestore ACK/);
});
