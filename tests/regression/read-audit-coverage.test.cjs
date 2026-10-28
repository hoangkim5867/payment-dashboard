'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
function read(file){return fs.readFileSync(path.resolve(__dirname,'../../site',file),'utf8');}
for(const file of ['payment.html','payment-mobile-renderer.html']){
 test(file+': listener first snapshot audit does not request more data',()=>{
  const s=read(file),i=s.indexOf('// First snapshot only; this does not make another Firestore request.');
  assert.ok(i>0);const block=s.slice(i,s.indexOf('applyRealtimePaymentSnapshot(',i));
  assert.match(block,/if\(firstSnapshot\)/);
  assert.match(block,/documentsReturned:snapshot\.size/);
  assert.match(block,/month:normalizedMonth \|\| 'ALL'/);
  assert.doesNotMatch(block,/\b(?:getDocs|getDoc|onSnapshot|addDoc|writeBatch)\s*\(/);
 });
}
test('desktop Export Watch page counts use already returned snapshots',()=>{
 const s=read('payment.html');
 for(const marker of ["'[Firestore Read Audit] Export Watch page'","'[Firestore Read Audit] Export Watch fallback page'"]){
  const i=s.indexOf(marker);assert.ok(i>0);assert.match(s.slice(i,i+190),/documentsReturned:snapshot\.size/);
 }
});
test('Cash Control traces existing plan, actual and project queries',()=>{
 const s=read('cash-control.html');
 for(const marker of ["'[Firestore Read Audit] Cash Control plan month'","'[Firestore Read Audit] Cash Control actual paid month'","'[Firestore Read Audit] Cash Control project detail'"]){assert.ok(s.includes(marker),marker);}
});
