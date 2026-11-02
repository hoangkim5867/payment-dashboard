'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'../..');
const modulePath=path.join(root,'site/assets/js/payment-doc-link-ui.mjs');
const code=fs.readFileSync(modulePath,'utf8');
const payment=fs.readFileSync(path.join(root,'site/payment.html'),'utf8');
const archive=fs.readFileSync(path.join(root,'site/payment-archive.html'),'utf8');
const rules=fs.readFileSync(path.join(root,'security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8');

test('Payment and Kho expose same isolated document link editor without removing historical paid workflow',()=>{
 assert.match(payment,/<script type="module" src="\.\/assets\/js\/payment-doc-link-ui\.mjs"><\/script>/);
 assert.match(archive,/<script type="module" src="\.\/assets\/js\/payment-doc-link-ui\.mjs"><\/script>/);
 assert.match(archive,/data-payment-id="\$\{escapeHtml\(paymentId\)\}"/);
 assert.match(payment,/Bù tiến trình/);
 assert.match(rules,/temporaryPaymentMonthAccess/);
});

test('Only explicit click reads one payment, no automatic payment collection scans/listeners',()=>{
 assert.match(code,/payment\.addEventListener\("click"/);
 assert.match(code,/archive\.addEventListener\("click"/);
 assert.match(code,/getDoc\(doc\(db,"payments",id\)\)/);
 assert.doesNotMatch(code,/onSnapshot\s*\(|getDocs\s*\(|collection\s*\(/);
 assert.match(code,/const OWNER_ADMIN_UID=/);
 assert.match(code,/uid===OWNER_ADMIN_UID/);
 assert.match(code,/ipcDocumentUrl:url,ipcDocumentUpdatedAt:serverTimestamp\(\),ipcDocumentUpdatedByUid:u.uid/);
 assert.match(code,/ipcDocumentUrl:deleteField\(\)/);
});

test('User-pasted Google link is validated before display or save',()=>{
 const first=code.indexOf('const driveUrl=raw=>');
 const last=code.indexOf('const style=',first);
 assert.ok(first>=0&&last>first);
 const evaluate=vm.runInNewContext(code.slice(first,last)+'\ndriveUrl',{URL});
 const cases=[
  ['https://drive.google.com/drive/folders/1o4Ky8GR-dOfohbfqytqbG3C6LLS',true],
  ['https://drive.google.com/file/d/1BX5qQN7nRqpCWoPD_evwCkeRtTV2Dzzn/view',true],
  ['https://docs.google.com/document/d/1BX5qQN7nRqpCWoPD_evwCkeRtTV2Dzzn/edit',true],
  ['https://drive.google.com.evil.net/file/d/1BX5qQN7nRqpCWoPD_evwCkeRtTV2Dzzn/view',false],
  ['https://example.com/file/d/1BX5qQN7nRqpCWoPD_evwCkeRtTV2Dzzn/view',false],
  ['javascript:alert(1)',false],
  ['https://drive.google.com/file/d/short/view',false]
 ];
 for(const [url,allowed] of cases)assert.equal(Boolean(evaluate(url)),allowed,url);
});
