'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {computeIndexV1,duplicateKeyV1}=require('../../backend/payment-index-core.cjs');
let app,db;
const evidence={environment:'local Firestore Emulator',syntheticFixture:true,scenarios:[]};
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator only');
 app=initializeApp({projectId:'demo-payment-index-validation'},'index-validation');db=getFirestore(app);
 await db.recursiveDelete(db.collection('payments'));
 const batch=db.batch();
 for(let i=0;i<100;i++){
  const row={project:'Eaton Park',contractNo:'C'+i,ipcNo:'IPC'+i,paymentType:'Contract',paymentMonth:'2026-09',amount:i+1};
  batch.set(db.collection('payments').doc('p'+i),{...row,...computeIndexV1(row)});
 }
 const duplicate={project:'Eaton Park',contractNo:'C1',ipcNo:'IPC1',paymentType:'Contract',paymentMonth:'2026-10',amount:500};
 batch.set(db.collection('payments').doc('cross-month'),{...duplicate,...computeIndexV1(duplicate)});await batch.commit();
});
test.after(async()=>{
 fs.writeFileSync(path.join(__dirname,'index-live-results.json'),JSON.stringify(evidence,null,2));await deleteApp(app);
});
for(const page of ['payment.html','payment-mobile-renderer.html'])test(page+': actual query helper matches full scan across months',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../site',page),'utf8');
 const start=src.indexOf('async function ensureImportDuplicateHistoryForRows('),end=src.indexOf('async function ensureImportDuplicateHistory()',start);
 let returnedDocuments=0,queries=0;
 const context={Set,Map,TextEncoder,console,db,paymentsRef:db.collection('payments'),PAYMENT_INDEX_QUERY_CODE_ENABLED:true,
  paymentIndexV1Ready:async()=>true,importDuplicateHistoryPayments:[],importDuplicateHistoryLoaded:false,
  paymentContractKey:(a,b)=>a+'||'+b,normalize:x=>String(x).toLowerCase(),importPaymentLookupKey:duplicateKeyV1,
  normalizeLoadedPaymentData:x=>x,where:(field,op,value)=>({field,op,value}),query:(ref,w)=>ref.where(w.field,w.op,w.value),
  getDocs:async q=>{const snap=await q.get();queries++;returnedDocuments+=snap.size;return snap},
  ensureImportDuplicateHistory:async()=>{const snap=await db.collection('payments').get();queries++;returnedDocuments+=snap.size;return snap.docs.map(d=>({id:d.id,...d.data()}))}};
 vm.createContext(context);vm.runInContext(src.slice(start,end),context);
 const rows=[{data:{project:'Eaton Park',contractNo:'C1',ipcNo:'IPC1',amount:1}}];
 const indexed=await context.ensureImportDuplicateHistoryForRows(rows);
 assert.deepEqual(Array.from(indexed,x=>x.id).sort(),['cross-month','p1']);
 const optimized={queries,returnedDocuments};returnedDocuments=0;queries=0;context.paymentIndexV1Ready=async()=>false;
 const legacy=await context.ensureImportDuplicateHistoryForRows(rows);
 assert.deepEqual(Array.from(legacy).filter(x=>duplicateKeyV1(x)===duplicateKeyV1(rows[0].data)).map(x=>x.id).sort(),Array.from(indexed,x=>x.id).sort());
 evidence.scenarios.push({page,collectionDocuments:101,legacy:{queries,returnedDocuments},indexed:optimized,markerReadExcluded:true,billingMeasurement:false});
});
test('synchronous indexed fixture: add/edit/change month/soft-delete/restore/delete',async()=>{
 const ref=db.collection('payments').doc('mutation');
 async function write(row){await ref.set({...row,...computeIndexV1(row)})}
 const row={project:'PH',contractNo:'PH-MEP001',ipcNo:'IPC9',paymentMonth:'2026-09',paymentType:'MEP'};
 await write(row);
 let snap=await db.collection('payments').where('duplicateKeyV1','==',duplicateKeyV1(row)).get();assert.equal(snap.size,1);
 row.paymentMonth='2026-10';await write(row);snap=await db.collection('payments').where('duplicateKeyV1','==',duplicateKeyV1(row)).get();assert.equal(snap.docs[0].data().paymentMonth,'2026-10');
 const old=duplicateKeyV1(row);row.ipcNo='IPC10';await write(row);assert.equal((await db.collection('payments').where('duplicateKeyV1','==',old).get()).size,0);
 row.deleted=true;await write(row);assert.equal((await db.collection('payments').where('mepLookupV1','==',true).get()).size,0);
 row.deleted=false;await write(row);assert.equal((await db.collection('payments').where('mepLookupV1','==',true).get()).size,1);
 await ref.delete();assert.equal((await db.collection('payments').where('duplicateKeyV1','==',duplicateKeyV1(row)).get()).size,0);
 evidence.scenarios.push({scenario:'synthetic synchronous writer lifecycle',pass:true,applicationWritersCertified:false});
});
test('reproduce missing IPC after existing writer changes IPC without index fields',async()=>{
 const row={project:'PH',contractNo:'C-RISK',ipcNo:'OLD',paymentMonth:'2026-09',paymentType:'MEP'};
 const ref=db.collection('payments').doc('stale-index');await ref.set({...row,...computeIndexV1(row)});
 await ref.update({ipcNo:'NEW',paymentMonth:'2026-10'});
 const current={...row,ipcNo:'NEW',paymentMonth:'2026-10'};
 const indexed=await db.collection('payments').where('duplicateKeyV1','==',duplicateKeyV1(current)).get();
 const legacy=await db.collection('payments').get();
 assert.equal(indexed.size,0);assert.equal(legacy.docs.filter(d=>duplicateKeyV1(d.data())===duplicateKeyV1(current)).length,1);
 evidence.scenarios.push({scenario:'existing writer without synchronous maintenance',indexedMatches:0,legacyMatches:1,releaseBlocker:true,gateMustRemainFalse:true});
});
for(const page of ['payment.html','payment-mobile-renderer.html'])test(page+': fallback refreshes changes made in another session',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../../site',page),'utf8');
 const start=src.indexOf('async function ensureImportDuplicateHistory(){'),end=src.indexOf('function findSameMonthDuplicateImport(',start);
 const context={console,performance,importDuplicateHistoryLoaded:false,importDuplicateHistoryPayments:[],importDuplicateHistoryPromise:null,paymentsRef:db.collection('payments'),normalizeLoadedPaymentData:x=>x,getDocs:q=>q.get()};
 vm.createContext(context);vm.runInContext(src.slice(start,end),context);
 await context.ensureImportDuplicateHistory();
 const ref=db.collection('payments').doc('remote-'+page);await ref.set({project:'PH',contractNo:'REMOTE',ipcNo:page,paymentMonth:'2026-01'});
 const next=await context.ensureImportDuplicateHistory();assert.ok(next.some(x=>x.id===ref.id));
 await ref.delete();
 const afterDelete=await context.ensureImportDuplicateHistory();assert.equal(afterDelete.some(x=>x.id===ref.id),false);
});
