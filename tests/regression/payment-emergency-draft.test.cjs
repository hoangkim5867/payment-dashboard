'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(page+' emergency drafts use encrypted recovery and preserve original Save validation',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
  assert.match(src,/import \{createPaymentEmergencyDrafts\} from "\.\/assets\/js\/payment-emergency-drafts\.mjs"/);
  assert.match(src,/const emergencyPaymentDrafts=createPaymentEmergencyDrafts\(/);
  assert.match(src,/emergencyPaymentDrafts\.notifyWriteFailure\(\)/);
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
