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
test('normal Save invokes amount-only atomic write before the original transaction',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
 const start=html.indexOf('savePaymentBtn.addEventListener(');
 const end=html.indexOf('/* =====================================================\\n   MANUAL ADD',start);
 const code=html.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.match(code,/buildAmountOnlyFormPatch\\(/);
 assert.match(code,/if\\(amountOnlyPatch\\)\\{[\\s\\S]*?await updateDoc\\(doc\\(db,"payments",editingId\\),\\{/);
 assert.match(code,/else if\\(bankOnlyPatch\\)/);
 assert.match(code,/else\\{[\\s\\S]*?await runTransaction\\(/);
 assert.match(code,/if\\(!sameTimestamp\\(livePayment\\.updatedAt,editingUpdatedAtAtOpen\\)\\)/);
 assert.doesNotMatch(html,/saveAmountOnlyBtn/);
 assert.doesNotMatch(html,/Chỉ cập nhật số tiền của Payment này/);
});
test('normal form fast path rejects mixed changes and preserves amount base',async()=>{
 const {buildAmountOnlyFormPatch}=await helper;
 const previous={amount:900000000,bankAccount:'old',ipcNo:'IPC014',remark:'',processPaper:'done',contractName:'EATON'};
 const changed={...previous,amount:1400000000};
 assert.deepEqual(buildAmountOnlyFormPatch(previous,changed,nonce),{amount:1400000000,amountEditGuard:{baseAmount:900000000,nonce}});
 assert.equal(buildAmountOnlyFormPatch(previous,{...changed,bankAccount:'different'},nonce),null);
 assert.equal(buildAmountOnlyFormPatch(previous,{...changed,ipcNo:'IPC015'},nonce),null);
 assert.equal(buildAmountOnlyFormPatch(previous,{...changed,processPaper:'pending'},nonce),null);
 assert.equal(buildAmountOnlyFormPatch(previous,{...previous},nonce),null);
});
test('proposed Rules validate amount-only old value and nonce in resource.data',()=>{
 const rules=fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.AMOUNT_CAS_STAGING_ONLY'),'utf8');
 assert.match(rules,/function safeAmountEditGuard\(\)/);
 assert.match(rules,/request\.resource\.data\.amountEditGuard\.baseAmount == resource\.data\.amount/);
 assert.match(rules,/request\.resource\.data\.amountEditGuard\.nonce/);
 assert.match(rules,/safeAmountEditGuard\(\)/);
 assert.match(rules,/amountEditGuard','remark/);
});
