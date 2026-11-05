'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const modulePath=pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-bank-only-edit.mjs'));
test('bank-only changes return narrow patch without amount, IPC or workflow',async()=>{
 const {buildBankOnlyPaymentPatch}=await import(modulePath);
 const old={bankAccount:'OLD BANK',project:'P',contractNo:'C',ipcNo:'001',amount:250,processPaper:'done',paymentMonth:'2026-11'};
 assert.deepEqual(buildBankOnlyPaymentPatch(old,{...old,bankAccount:'NEW BANK'}),{bankAccount:'NEW BANK'});
 assert.equal(buildBankOnlyPaymentPatch(old,{...old,bankAccount:'NEW BANK',amount:251}),null);
 assert.equal(buildBankOnlyPaymentPatch(old,{...old,bankAccount:'NEW BANK',ipcNo:'002'}),null);
 assert.equal(buildBankOnlyPaymentPatch(old,{...old,bankAccount:'NEW BANK',contractNo:'C2'}),null);
 assert.equal(buildBankOnlyPaymentPatch(old,{...old,bankAccount:'NEW BANK',processPaper:'pending'}),null);
 assert.equal(buildBankOnlyPaymentPatch(old,old),null);
 assert.equal(buildBankOnlyPaymentPatch(null,{bankAccount:'NEW'}),null);
});
test('empty legacy optional fields are tolerated but nonblank changes are not',async()=>{
 const {buildBankOnlyPaymentPatch}=await import(modulePath);
 assert.deepEqual(buildBankOnlyPaymentPatch({bankAccount:'OLD'}, {bankAccount:'NEW',remark:''}),{bankAccount:'NEW'});
 assert.equal(buildBankOnlyPaymentPatch({bankAccount:'OLD'}, {bankAccount:'NEW',remark:'new'}),null);
});
test('desktop Payment bank-only branch updates one field; other edits retain transaction guard',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
 assert.match(html,/import \{buildBankOnlyPaymentPatch\} from "\.\/assets\/js\/payment-bank-only-edit\.mjs"/);
 assert.match(html,/const bankOnlyPatch = buildBankOnlyPaymentPatch\(existingPayment,data\)/);
 assert.match(html,/if\(bankOnlyPatch\)\{[\s\S]*?await updateDoc\(doc\(db,"payments",editingId\),\{[\s\S]*?\.\.\.bankOnlyPatch,[\s\S]*?\}\);[\s\S]*?\}else\{[\s\S]*?await runTransaction\(db, async transaction =>/);
 assert.match(html,/if\(!sameTimestamp\(livePayment\.updatedAt,editingUpdatedAtAtOpen\)\)/);
});
