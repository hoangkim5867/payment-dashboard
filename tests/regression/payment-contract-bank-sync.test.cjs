'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
test('Bank sync is automatic through the sole Save button',()=>{
 assert.doesNotMatch(html,/id="syncContractBankBtn"/);
 assert.doesNotMatch(html,/syncContractBankBtn\?\.addEventListener/);
 assert.equal((html.match(/id="savePaymentBtn"/g)||[]).length,1);
 assert.match(html,/const contractBankComparisonData = \{\.\.\.data\}/);
 assert.match(html,/const bankOnlyPatch = buildBankOnlyPaymentPatch\(\s*existingPayment,contractBankComparisonData\s*\)/);
});
test('Bank-only update writes only the bank field and audit tracks committed data',()=>{
 const section=html.split('const bankOnlyPatch = buildBankOnlyPaymentPatch(')[1].split('paymentWriteAcknowledged=true')[0];
 assert.match(section,/else if\(bankOnlyPatch\)\{[\s\S]*?await updateDoc\(doc\(db,"payments",editingId\),\{\s*\.\.\.bankOnlyPatch,/);
 assert.match(html,/const committedEditData = bankOnlyPatch[\s\S]*?\{\.\.\.existingPayment,\.\.\.bankOnlyPatch\}/);
 assert.doesNotMatch(section,/getDoc\(/);
 assert.doesNotMatch(section,/getDocs\(/);
 assert.match(section,/else\{\s*await runTransaction\(/);
 assert.match(html,/normalize\(existingPayment\.contractId\) === normalize\(data\.contractId\)/);
});
test('Mixed edits preserve guarded transaction and Add remains direct',()=>{
 assert.match(html,/if\(!sameTimestamp\(livePayment\.updatedAt,editingUpdatedAtAtOpen\)\)/);
 assert.match(html,/await addDoc\(\s*paymentsRef/);
});
