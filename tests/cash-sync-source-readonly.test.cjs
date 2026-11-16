'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect,checkedConfig,validateRequest}=require('../api/cash-sync-source-readonly.js')._internals;
const prod={VERCEL_ENV:'production',CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',
 CASH_SYNC_ADMIN_UID:'lehoangoanh-uid'};
const token='synthetic-id-token';
const auth=async(jwt,config)=>{assert.equal(jwt,token);
 assert.equal(config.project,'cscecmep-payment');
 assert.equal(config.uid,'lehoangoanh-uid')};
const a=values=>({arrayValue:{values:Array.from({length:values},()=>({mapValue:{fields:{}}}))}});
const doc={fields:{
 revision:{integerValue:'23'},projectMasters:a(35),manualRecords:a(3),
 salaryRecords:a(12),inflowRecords:a(5),schemaVersion:{integerValue:'3'},
 updatedAt:{stringValue:'2026-11-13T10:00:00Z'}
}};
test('trusted production Admin can inspect one private Cash Control document without leaking contents',async()=>{
 const seen=[];
 const out=await inspect({env:prod,action:'metadata',firebaseJwt:token,
  verifyAdmin:auth,fetcher:async(url,options)=>{
   seen.push({url,options});
   return {ok:true,json:async()=>structuredClone(doc)};
  }});
 assert.equal(out.revision,23);assert.equal(out.projectMasters,35);
 assert.equal(out.manualRecords,3);assert.equal(out.salaryRecords,12);
 assert.equal(out.sourceComplete,false);assert.equal(out.canSync,false);
 assert.equal(out.paymentDocumentReads,0);assert.equal(out.firestoreRequests,1);
 assert.equal(out.googleReads,0);assert.equal(out.googleWrites,0);
 assert.equal(JSON.stringify(out).includes('fields'),false);
 assert.equal(seen.length,1);assert.equal(seen[0].options.method,'GET');
 assert.ok(seen[0].url.includes('/cash_control_private/lehoangoanh?mask.fieldPaths='));
 assert.equal(seen[0].options.headers.Authorization,'Bearer '+token);
});
test('one project COUNT aggregation sends only indexed scope and never returns document contents',async()=>{
 const seen=[];
 const out=await inspect({env:prod,action:'project_count',project:'FOXCONN',
  firebaseJwt:token,verifyAdmin:auth,fetcher:async(url,options)=>{
   seen.push({url,options});
   return {ok:true,json:async()=>[{
     result:{aggregateFields:{paymentCount:{integerValue:'101'}}}
   }]};
  }});
 assert.equal(out.paymentDocumentCount,101);
 assert.equal(out.paymentDocumentsReturned,0);
 assert.equal(out.firestoreRequests,1);
 assert.equal(out.sourceComplete,false);
 assert.equal(out.canSync,false);
 assert.equal(seen.length,1);
 assert.equal(seen[0].options.method,'POST');
 assert.ok(seen[0].url.endsWith(':runAggregationQuery'));
 const body=JSON.parse(seen[0].options.body);
 assert.deepEqual(body.structuredAggregationQuery.structuredQuery.from,
  [{collectionId:'payments'}]);
 assert.equal(body.structuredAggregationQuery.structuredQuery.where
  .fieldFilter.value.stringValue,'FOXCONN');
 assert.ok(!seen.some(s=>s.url.includes('sheets.googleapis.com')));
});
test('staging Preview and wrong Firebase app fail before token verification or requests',async()=>{
 for(const env of [
   {...prod,VERCEL_ENV:'preview'},
   {...prod,CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging'},
   {...prod,CASH_SYNC_ADMIN_UID:''}
 ]){
  let called=0;
  await assert.rejects(inspect({env,action:'metadata',firebaseJwt:token,
   verifyAdmin:async()=>{called++},fetcher:async()=>{called++;throw Error('network')}}),
   /PRODUCTION_FIREBASE_AUTH_REQUIRED|TRUSTED_ADMIN_UID_NOT_CONFIGURED/);
  assert.equal(called,0);
 }
});
test('untrusted or broad scopes and malformed source replies stop before writes',async()=>{
 for(const payload of [
  {action:'project_count',project:''},
  {action:'project_count',project:'../payments'},
  {action:'project_count',project:'FOXCONN',everyProject:true},
  {action:'metadata',project:'FOXCONN'},
  {action:'sync'},
  {action:'project_count',project:'FOXCONN '}
 ])assert.throws(()=>validateRequest(payload),/INVALID_PROJECT_SCOPE|UNEXPECTED_SOURCE_FIELDS|INVALID_SOURCE_ACTION/);
 await assert.rejects(inspect({env:prod,action:'project_count',project:'FOXCONN',
  firebaseJwt:token,verifyAdmin:auth,
  fetcher:async()=>({ok:true,json:async()=>[]})}),/PAYMENT_COUNT_NOT_VERIFIED/);
 await assert.rejects(inspect({env:prod,action:'metadata',firebaseJwt:token,
  verifyAdmin:auth,fetcher:async()=>({ok:false,status:403})}),
  /FIRESTORE_READ_HTTP_403/);
});
test('source scope has no automatic company-wide scans or Firestore writes',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const code=fs.readFileSync(path.join(__dirname,'../api/cash-sync-source-readonly.js'),'utf8');
 assert.match(code,/VERCEL_ENV!=='production'/);
 assert.match(code,/CASH_SYNC_FIREBASE_PROJECT_ID!==FIREBASE/);
 assert.match(code,/verifyFirebaseAdminToken/);
 assert.match(code,/SINGLE_PROJECT_COUNT_ONLY/);
 assert.doesNotMatch(code,/sheets\.googleapis\.com|setDoc\(|writeBatch\(|addDoc\(|deleteDoc\(|bulkWriter|:commit|:batchWrite|onSnapshot\(/);
});

test('empty Firestore arrayValue counts as valid zero records and timestampValue preserved',async()=>{
 const empty={fields:{revision:{integerValue:'0'},projectMasters:{arrayValue:{}},
 manualRecords:{arrayValue:{}},salaryRecords:{arrayValue:{}},
 updatedAt:{timestampValue:'2026-11-13T09:00:00Z'},schemaVersion:{integerValue:'3'}}};
 const result=await inspect({env:prod,action:'metadata',firebaseJwt:token,
  verifyAdmin:auth,fetcher:async()=>({ok:true,json:async()=>empty})});
 assert.equal(result.metadataPresent,true);
 assert.equal(result.projectMasters,0);
 assert.equal(result.manualRecords,0);
 assert.equal(result.salaryRecords,0);
 assert.equal(result.updatedAt,'2026-11-13T09:00:00Z');
 assert.equal(result.sourceComplete,false);
});
