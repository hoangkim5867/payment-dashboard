'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(page+' emergency drafts use encrypted recovery and preserve original Save validation',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
  assert.match(src,/import \{createPaymentEmergencyDrafts\} from "\.\/assets\/js\/payment-emergency-drafts\.mjs"/);
  assert.match(src,/const emergencyPaymentDrafts=createPaymentEmergencyDrafts\(/);
  assert.match(src,/emergencyPaymentDrafts\.notifyWriteFailure\(draftWriteToken\)/);
  assert.match(src,/savePaymentBtn\.addEventListener\(/);
  assert.match(src,/findManualDuplicatePayment\(/);
  assert.match(src,/editingUpdatedAtAtOpen/);
 });
}
test('emergency drafts are encrypted at rest, never auto-submit to Firebase',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../../site/assets/js/payment-emergency-drafts.mjs'),'utf8');
 assert.match(src,/PBKDF2/);assert.match(src,/AES-GCM/);
 assert.match(src,/crypto\.subtle\.encrypt/);assert.match(src,/crypto\.subtle\.decrypt/);
 assert.match(src,/indexedDB\.open/);
 assert.doesNotMatch(src,/\b(?:addDoc|updateDoc|setDoc|writeBatch|runTransaction|getDocs|onSnapshot)\s*\(/);
 assert.match(src,/payload\.context\.editVersion!==ctx\.editVersion/);
 assert.match(src,/payload\.context\.editingId!==ctx\.editingId/);
});

test('mobile edit uses atomic transaction rather than a separate getDoc and updateDoc',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../../site/payment-mobile-renderer.html'),'utf8');
 const a=src.indexOf('savePaymentBtn.addEventListener('),b=src.indexOf('const editChanges =',a);
 const save=src.slice(a,b);
 assert.match(save,/await runTransaction\(db,async transaction=>/);
 assert.match(save,/transaction\.get\(paymentRef\)/);
 assert.match(save,/sameTimestamp\(livePayment\.updatedAt,editingUpdatedAtAtOpen\)/);
 assert.match(save,/transaction\.update\(paymentRef/);
 assert.doesNotMatch(save,/await getDoc\(/);
});

for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(page+' post-save vendor/refresh failures cannot be reported as failed Payment writes',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
  const start=src.indexOf('savePaymentBtn.addEventListener(');
  const end=src.indexOf('MANUAL ADD — LIGHTWEIGHT DUPLICATE LOOKUP',start);
  const save=src.slice(start,end);
  assert.match(save,/PAYMENT POST-SAVE VENDOR SYNC ERROR/);
  assert.match(save,/PAYMENT POST-SAVE VIEW REFRESH ERROR/);
  assert.match(save,/Payment đã lưu trên Firestore/);
  assert.match(save,/try\{\s*await upsertVendor\(/);
  assert.match(save,/try\{\s*await loadPayments\(\)/);
 });
}

for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(page+' allows the Add modal to open for drafting when contracts cannot be fetched',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
  const a=src.indexOf('addPaymentBtn.addEventListener('),b=src.indexOf('/* =====================================================\n    EDIT',a);
  const section=src.slice(a,b);
  assert.match(section,/let addContractLoadFailed = false/);
  assert.match(section,/addContractLoadFailed = true/);
  assert.match(section,/paymentModal\.classList\.add\(/);
  assert.match(section,/if\(addContractLoadFailed\)/);
  assert.match(section,/Lưu nháp mã hóa/);
 });
 test(page+' does not carry an encrypted draft key into another Add/Edit record',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
  assert.match(src,/function closePaymentModal\(\)\{\s*emergencyPaymentDrafts\.resetSession\(\)/);
  assert.match(src,/emergencyPaymentDrafts\.resetSession\(\);\s*editingId =\s*null;/);
  assert.match(src,/emergencyPaymentDrafts\.resetSession\(\);\s*editingId =\s*payment\.id;/);
 });
}

for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(page+' restores project choices before dependent contract number',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
  assert.match(src,/prepareRestore:\(\)=>updateFormProjects\(\)/);
  assert.match(src,/if\(id==="formProject"\)updateContractOptions\(\)/);
  assert.match(src,/if\(id==="formContractNo"\)\{updateContractInfo\(\);refreshContractIPCPreview\(\);\}/);
 });
}
test('draft restore displays unresolved select values instead of manufacturing selectable contracts',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../../site/assets/js/payment-emergency-drafts.mjs'),'utf8');
 assert.match(src,/export function restoreDraftFields/);
 assert.match(src,/priority=\['formPaymentMonth'/);
 assert.match(src,/el\.value!==wanted/);
 assert.match(src,/Cần nhập lại các trường chưa khôi phục được/);
});

test('closing a draft queues its final encrypted snapshot before clearing the active key',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../../site/assets/js/payment-emergency-drafts.mjs'),'utf8');
 const start=src.indexOf('    resetSession(){'),end=src.indexOf('    notifyWriteFailure(token){',start);
 const part=src.slice(start,end);
 assert.match(part,/const finalSnapshot=/);
 assert.match(part,/clearTimeout\(debounce\)/);
 assert.match(part,/persisting=persisting\.then\(async\(\)=>/);
 assert.match(part,/await storeRow\(/);
 assert.match(part,/active=null/);
 assert.doesNotMatch(part,/\b(?:setDoc|addDoc|updateDoc|runTransaction)\s*\(/);
});

test('committed local draft cleanup waits for pending writes and cannot resurrect the record',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../../site/assets/js/payment-emergency-drafts.mjs'),'utf8');
 const a=src.indexOf('notifyWriteSuccess(token){'),b=src.indexOf('resetSession(){',a);
 const section=src.slice(a,b);
 assert.match(section,/then\(\(\)=>removeRow\(savedSession\.id\)\)/);
 assert.match(section,/active=null/);
});
for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(page+' acknowledges both Add and Edit at the server write, before optional activity logging',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
  const a=src.indexOf('savePaymentBtn.addEventListener(');
  const z=src.indexOf('/* =====================================================\\n   MANUAL ADD',a);
  const save=src.slice(a,z);
  const acks=[...save.matchAll(/emergencyPaymentDrafts\.notifyWriteSuccess\(draftWriteToken\)/g)].map(x=>x.index);
  const editWrite=save.indexOf('await runTransaction('),addWrite=save.indexOf('await addDoc(');
  const editLog=save.indexOf('await logActivity(',editWrite),addLog=save.indexOf('await logActivity(',addWrite);
  assert.equal(acks.length,2);
  assert.ok(editWrite>=0&&editWrite<acks[0]&&acks[0]<editLog);
  assert.ok(addWrite>=0&&addWrite<acks[1]&&acks[1]<addLog);
  assert.ok(addLog<save.indexOf('await upsertVendor('));
  assert.equal((save.match(/emergencyPaymentDrafts\.beginWrite\(\)/g)||[]).length,2);
  assert.match(save,/PAYMENT POST-SAVE ACTIVITY LOG ERROR/);
  assert.match(save,/paymentWriteAcknowledged/);
 });
}
test('draft cleanup and explicit removal serialize behind pending writes',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../../site/assets/js/payment-emergency-drafts.mjs'),'utf8');
 assert.match(src,/pendingWrites=new Map/);
 assert.match(src,/beginWrite\(\)/);
 assert.match(src,/session=active/);
 assert.match(src,/then\(\(\)=>removeRow\(savedSession\.id\)\)/);
 assert.match(src,/then\(\(\)=>removeRow\(row\.id\)\)/);
 assert.match(src,/PAYMENT COMMITTED DRAFT CLEANUP FAILED/);
});
