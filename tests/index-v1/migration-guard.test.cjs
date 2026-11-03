'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {readOptions,inspectPayment}=require('../../backend/index-migration-core.cjs');
const base={GOOGLE_CLOUD_PROJECT:'cscecmep-payment'};
const emulator={GOOGLE_CLOUD_PROJECT:'demo-payment-index',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'};
test('migration defaults to read-only, bounded and inactive; production writes require explicit approval',()=>{
 const plain=readOptions([],base);
 assert.equal(plain.write,false);
 assert.equal(plain.maxDocs,120);assert.equal(plain.maxWrites,60);
 assert.equal(plain.startAfter,null);
 assert.throws(()=>readOptions(['--write'],base),/Production writes require/);
 assert.throws(()=>readOptions(['--write','--production-approved'],{...base,PAYMENT_PRODUCTION_APPROVED:'YES'}),/backup, Rules/);
 assert.throws(()=>readOptions(['--mark-ready'],base),/Activation disabled/);
 assert.throws(()=>readOptions(['--max-docs=201'],base),/between 1 and 200/);
 assert.throws(()=>readOptions(['--max-writes=101'],base),/between 1 and 100/);
 assert.throws(()=>readOptions(['--write','--audit'],emulator),/conflicts/);
 assert.throws(()=>readOptions(['--unknown'],emulator),/Unknown flag/);
 const approved=readOptions(['--write','--production-approved','--max-docs=25','--max-writes=10','--start-after=opaque-id'],{
  ...base,PAYMENT_PRODUCTION_APPROVED:'YES',PAYMENT_BACKUP_VERIFIED:'YES',PAYMENT_RULES_AUDITED:'YES'});
 assert.equal(approved.write,true);assert.equal(approved.maxDocs,25);
 assert.equal(approved.maxWrites,10);assert.equal(approved.startAfter,'opaque-id');
 assert.equal(readOptions(['--write'],emulator).write,true);
});
test('derived fields are identical to source index, preserve every business field and handle blank legacy IPCs',()=>{
 const row={project:'EATON PARK P1',contractNo:'CSCECVN-001',ipcNo:'IPC001',paymentMonth:'2026-10',
  amount:100,personInCharge:'Staff',uncUrl:'https://example.invalid/private'};
 const result=inspectPayment(row);
 assert.equal(result.ok,true);assert.equal(result.needsRepair,true);
 assert.deepEqual(Object.keys(result.fields).sort(),['duplicateKeyV1','mepLookupV1','paymentLookupSchemaV1']);
 assert.equal(inspectPayment({...row,...result.fields}).needsRepair,false);
 assert.equal(row.amount,100);assert.equal(row.uncUrl,'https://example.invalid/private');
 assert.equal(inspectPayment({project:'',contractNo:'',ipcNo:''}).ok,true);
 const long=inspectPayment({...row,project:'X'.repeat(2000)});
 assert.equal(long.ok,false);assert.equal(long.reason,'key_too_long');
});
test('migration is resumable, operates under a strict page cap, and never flips readiness or bulk-overwrites payment business fields',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../backend/backfill-index.cjs'),'utf8');
 assert.match(src,/orderBy\(FieldPath\.documentId\(\)\)\.limit\(Math\.min\(50,cfg\.maxDocs-inspected\)\)/);
 assert.match(src,/if\(cursor\)q=q\.startAfter\(cursor\)/);
 assert.match(src,/const fresh=await tx\.get\(doc\.ref\)/);
 assert.match(src,/const now=inspectPayment\(fresh\.data\(\)\)/);
 assert.match(src,/tx\.update\(doc\.ref,now\.fields\)/);
 assert.match(src,/updated>=cfg\.maxWrites/);
 assert.match(src,/markerActivated:false/);
 assert.doesNotMatch(src,/systemConfig|paymentLookupV1|deleteDoc\(/);
});
test('first indexed preview is already key-scoped and never calls full collection scan when marker is safely ready',()=>{
 for(const page of ['payment.html','payment-mobile-renderer.html']){
  const src=fs.readFileSync(path.join(__dirname,'../../site',page),'utf8');
  const start=src.indexOf('async function ensureImportDuplicateHistoryForRows(');
  const end=src.indexOf('async function ensureImportDuplicateHistory()',start);
  assert.ok(start>=0&&end>start);
  const body=src.slice(start,end);
  assert.match(body,/await paymentIndexV1Ready\(\)/);
  assert.match(body,/where\("duplicateKeyV1","in",keys\.slice\(i,i\+20\)\)/);
  assert.doesNotMatch(body,/getDocs\(paymentsRef\)/);
 }
});
