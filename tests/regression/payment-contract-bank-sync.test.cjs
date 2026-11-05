'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
test('Contract bank sync button is only an explicit Edit action',()=>{
 assert.match(html, /id="syncContractBankBtn" style="display:none;"/);
 assert.match(html, /syncBankBtn\.style\.display = sourceContract/);
 assert.match(html, /if\(syncBankBtn\)syncBankBtn\.style\.display = "none"/);
 assert.match(html, /syncContractBankBtn\?\.addEventListener\("click"/);
});
test('bank sync keeps Payment identity and all non-bank fields intact',()=>{
 const section=html.split('syncContractBankBtn?.addEventListener("click"')[1].split('/* =====================================================\n   SAVE')[0];
 assert.match(section,/await updateDoc\(doc\(db,"payments",payment\.id\),\{/);
 assert.match(section,/bankAccount:newBank/);
 for(const field of ['amount:','contractNo:','ipcNo:','processPaper:','processPaymentDate:']){
  assert.ok(!section.includes(field),field+' may not be written by bank-only sync');
 }
 assert.ok(!section.includes('runTransaction('));
 assert.ok(!section.includes('getDoc('));
 assert.ok(!section.includes('getDocs('));
 assert.match(section,/if\(!sourceContract\)/);
 assert.match(section,/if\(!newBank \|\| newBank===oldBank\)/);
 assert.match(section,/isPaymentWorkflowLocked\(payment\)/);
 assert.match(section,/if\(!confirm\(/);
 assert.match(section,/closePaymentModal\(\)/);
});
test('full Edit remains concurrency guarded and Add still direct',()=>{
 assert.match(html,/const bankOnlyPatch = buildBankOnlyPaymentPatch\(existingPayment,data\)/);
 assert.match(html,/await runTransaction\(db, async transaction => \{/);
 assert.match(html,/await addDoc\(\s*paymentsRef/);
});
