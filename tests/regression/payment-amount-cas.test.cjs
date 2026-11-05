'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const helper=import(pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-amount-only-edit.mjs')));
const nonce='123e4567-e89b-12d3-a456-426614174000';
test('only amount is changed; old server amount and per-attempt nonce are supplied',async()=>{
  const {buildAmountOnlyPatch}=await helper;
  const payment={id:'row',amount:1400000000,ipcNo:'IPC014',contractNo:'LAB-007',processPaper:'done'};
  assert.deepEqual(buildAmountOnlyPatch(payment,'1,500,000,000',nonce),{amount:1500000000,amountEditGuard:{baseAmount:1400000000,nonce}});
  assert.equal(buildAmountOnlyPatch(payment,'1,400,000,000',nonce),null);
  assert.equal(buildAmountOnlyPatch(payment,'not-money',nonce),null);
  assert.equal(buildAmountOnlyPatch(payment,'-100',nonce),null);
  assert.equal(buildAmountOnlyPatch(payment,'1500000000','invalid'),null);
});
test('amount-only button avoids reads and leaves full edits on guarded path',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
 const start=html.indexOf('amountOnlyBtn?.addEventListener("click"');
 const end=html.indexOf('/* =====================================================\n   SAVE',start);
 const code=html.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.match(code,/buildAmountOnlyPatch\(payment,formAmount\.value,crypto\.randomUUID\(\)\)/);
 assert.match(code,/await updateDoc\(doc\(db,"payments",payment\.id\),\{/);
 assert.doesNotMatch(code,/\b(?:runTransaction|getDoc|getDocs|addDoc)\s*\(/);
 assert.doesNotMatch(code.slice(code.indexOf('await updateDoc('),code.indexOf('});',code.indexOf('await updateDoc('))+3),/\.\.\.payment\b/);
 assert.match(code,/isPaymentWorkflowLocked\(payment\)/);
 assert.match(html,/if\(!sameTimestamp\(livePayment\.updatedAt,editingUpdatedAtAtOpen\)\)/);
});
test('proposed Rules validate amount-only old value and nonce in resource.data',()=>{
 const rules=fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.AMOUNT_CAS_STAGING_ONLY'),'utf8');
 assert.match(rules,/function safeAmountEditGuard\(\)/);
 assert.match(rules,/request\.resource\.data\.amountEditGuard\.baseAmount == resource\.data\.amount/);
 assert.match(rules,/request\.resource\.data\.amountEditGuard\.nonce/);
 assert.match(rules,/safeAmountEditGuard\(\)/);
 assert.match(rules,/amountEditGuard','remark/);
});
