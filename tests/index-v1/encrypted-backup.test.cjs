'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const {pathToFileURL}=require('node:url');
const codec=import(pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-backup-codec.mjs')));
const html=fs.readFileSync(path.join(__dirname,'../../site/admin-index-maintenance.html'),'utf8');
const password='strong-unique-passphrase-2026';
test('encrypted backup roundtrip retains financial and Firestore typed fields but does not reveal them',async()=>{
  const {sealPaymentBackup,openPaymentBackup}=await codec;
  const timestamp={seconds:1788831120,nanoseconds:9181235,toDate:()=>new Date()};
  const geo={latitude:10.7,longitude:106.7,isEqual:()=>true};
  const bytes={toBase64:()=>btoa('PDF')};
  const reference={type:'document',path:'contracts/001',firestore:{}};
  const docs=[{id:'private-payment-a',data:{
    project:'PHU HUNG',amount:1245000000,ipcNo:'IPC001',
    uncDocument:{name:'private-bank.pdf',data:bytes},createdAt:timestamp,
    relatedContract:reference,location:geo,nested:{values:[null,true,0,'—']}
  }},{id:'private-payment-b',data:{project:'EATON PARK',amount:0,deleted:false}}];
  const envelope=await sealPaymentBackup({cryptoApi:webcrypto,passphrase:password,docs,createdAt:'2026-11-03T04:20:00.000Z'});
  const raw=JSON.stringify(envelope);
  for(const sensitive of ['PHU HUNG','EATON PARK','1245000000','private-payment-a','private-bank.pdf']){
    assert.equal(raw.includes(sensitive),false,'plaintext data must not be in downloaded file');
  }
  assert.equal(envelope.algorithm,'AES-256-GCM');
  assert.equal(envelope.count,2);
  const recovered=await openPaymentBackup({cryptoApi:webcrypto,passphrase:password,envelope});
  assert.equal(recovered.count,2);
  assert.equal(recovered.sha256,envelope.sha256);
  const row=recovered.payload.docs[0];
  assert.equal(row[0],'private-payment-a');
  const map=Object.fromEntries(row[1][1]);
  assert.deepEqual(map.createdAt,['timestamp',1788831120,9181235]);
  assert.deepEqual(map.relatedContract,['reference','contracts/001']);
  assert.deepEqual(map.location,['geopoint',10.7,106.7]);
  assert.deepEqual(map.amount,['number',1245000000]);
  assert.deepEqual(Object.fromEntries(map.uncDocument[1]).data,['bytes','UERG']);
});
test('wrong password and tampered encrypted backup always fail closed',async()=>{
 const {sealPaymentBackup,openPaymentBackup}=await codec;
 const envelope=await sealPaymentBackup({cryptoApi:webcrypto,passphrase:password,
  docs:[{id:'p',data:{amount:123}}]});
 await assert.rejects(openPaymentBackup({cryptoApi:webcrypto,passphrase:'wrong-password-that-is-long-enough',envelope}));
 const encrypted=envelope.encrypted;
 const change=(encrypted[0]==='A'?'B':'A')+encrypted.slice(1);
 await assert.rejects(openPaymentBackup({cryptoApi:webcrypto,passphrase:password,envelope:{...envelope,encrypted:change}}));
 await assert.rejects(openPaymentBackup({cryptoApi:webcrypto,passphrase:password,envelope:{...envelope,count:2}}),/metadata mismatch|format or count/);
 await assert.rejects(sealPaymentBackup({cryptoApi:webcrypto,passphrase:'short',docs:[{id:'p',data:{amount:1}}]}),/at least 14/);
});
test('admin-only button backup is explicit and all Payment reads are bounded, no cloud upload or write',()=>{
 const body=html.split('<script type="module">')[1]?.split('</script>')[0]||'';
 assert.match(html,/Bước 0 · Sao lưu có mã hóa/);
 assert.match(body,/backupRun"\)\.addEventListener\("click",downloadPaymentBackup\)/);
 assert.match(body,/backupVerify"\)\.addEventListener\("click",verifyPaymentBackup\)/);
 assert.match(body,/const BACKUP_PAGE_SIZE=100,BACKUP_LIMIT=50000/);
 assert.match(body,/getDocsFromServer\(query\(collection\(db,"payments"\),\.\.\.args\)\)/);
 assert.match(body,/if\(auth\.currentUser\?\.uid!==uid\)throw/);
 assert.match(body,/const envelope=await sealPaymentBackup/);
 assert.match(body,/const checked=await openPaymentBackup/);
 assert.match(body,/checkBackupFreshness\(checked\)/);
 assert.match(body,/backupChecked=false/);
 assert.match(body,/!backupChecked\|\|!loadState\("audit"\)\.finished/);
 assert.doesNotMatch(body,/fetch\(|XMLHttpRequest|sendBeacon|localStorage/);
});
