'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const modulePromise=import(pathToFileURL(path.resolve(__dirname,'../../site/assets/js/payment-emergency-drafts.mjs')));
test('encrypted emergency draft round trip preserves project, contract, IPC and exact amount',async()=>{
 globalThis.crypto=webcrypto;
 const {encryptDraft,decryptDraft}=await modulePromise;
 const original={context:{uid:'userA',editingId:'payment-1',editVersion:1234,entryType:'mep'},
 fields:{formPaymentMonth:{value:'2026-10'},formProject:{value:'EATON PARK'},formContractNo:{value:'C001'},formIPC:{value:'IPC001'},formAmount:{value:'1000000'},processApproval:{value:''}}};
 const box=await encryptDraft(original,'local-draft-passphrase-2026');
 assert.equal(box.version,1);
 assert.ok(!JSON.stringify(box).includes('EATON PARK'));
 assert.deepEqual(await decryptDraft(box,'local-draft-passphrase-2026'),original);
 await assert.rejects(decryptDraft(box,'definitely-wrong-passphrase'),/mật khẩu sai/);
 const tampered={...box,cipher:box.cipher.slice(0,-4)+'AAAA'};
 await assert.rejects(decryptDraft(tampered,'local-draft-passphrase-2026'),/Không thể mở nháp/);
});
test('different salt and IV produce nonidentical ciphertext for same draft',async()=>{
 globalThis.crypto=webcrypto;
 const {encryptDraft}=await modulePromise;
 const a=await encryptDraft({amount:123},'local-draft-passphrase-2026');
 const b=await encryptDraft({amount:123},'local-draft-passphrase-2026');
 assert.notEqual(a.salt,b.salt);
 assert.notEqual(a.iv,b.iv);
 assert.notEqual(a.cipher,b.cipher);
});
