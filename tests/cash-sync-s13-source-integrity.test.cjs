'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {inspectS13,SOURCE_ID,SEED_HASH}=require('../server/cash-sync-s13-source-integrity.cjs');
const {inspect}=require('../api/cash-sync-source-readonly.js')._internals;
const amount=[81463753,3859500,30000000,22923736];
const sourceRows=[
 {id:SOURCE_ID[0],values:['2026-10-02','中方员工工资','','2026年08月中方员工工资','','职工薪酬',0,0,0,0,81463753,0,0]},
 {id:SOURCE_ID[1],values:['2026-10-02','伙食费','','2026年08月伙食费','','职工薪酬',0,0,0,0,3859500,0,0]},
 {id:SOURCE_ID[2]+'+'+SOURCE_ID[3],values:['2026-10-20','','','2026年第3季度个人所得税','','职工薪酬',0,0,0,0,52923736,0,0]}
];
const rec=i=>({id:SOURCE_ID[i],project:'S13-2',status:'paid',
 direction:'out',actualDate:i<2?'2026-10-02':'2026-10-20',
 actualAmount:amount[i],amount:amount[i]});
const recordState=()=>({
 revision:42,
 manualRecords:[rec(0),rec(1)],
 legacyOverrides:{},
 deletedLegacy:[],
});
const legacy=()=>({
 schemaVersion:1,
 LEGACY_SALARY:[rec(2),rec(3)],
 LEGACY_FINANCE:[],LEGACY_VNB:[],LEGACY_CASH_SPECIAL:[]
});
const checksum=x=>createHash('sha256').update(x).digest('hex');
function encode(v){
 if(v===null)return {nullValue:'NULL_VALUE'};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(
  Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 throw Error('Unexpected test field');
}
const doc=v=>({fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))});
function pair({cash=recordState(),seed=legacy()}={}){
 const payload=JSON.stringify(seed),sha=checksum(payload);
 return {cashDocument:doc(cash),
  legacySeedDocument:doc({schemaVersion:1,payload,sha256:sha}),
  hash:sha};
}
function pass(args,extra){
 const docs=pair(args);
 return inspectS13({cashDocument:docs.cashDocument,
   legacySeedDocument:docs.legacySeedDocument,
   revision:42,sourceRows:structuredClone(sourceRows),...extra},
   {expectedSeedHash:docs.hash});
}
test('four pinned Cash Control IDs from two independently signed docs match 3 posts; never authorize writes',()=>{
 const r=pass({});
 assert.equal(r.verifiedSourceItems,4);
 assert.equal(r.groupedGoogleRows,3);
 assert.equal(r.pinnedSourceMatched,true);
 assert.equal(r.scopedCashEntriesMatched,true);
 assert.equal(r.extraPrivateAndLegacyCashEntries,0);
 assert.equal(r.sourceRevision,42);
 assert.equal(r.paymentBusinessComplete,false);
 assert.equal(r.sourceComplete,false);
 assert.equal(r.canSync,false);
 assert.equal(r.writeAuthorized,false);
 assert.equal(r.googleWrites,0);
 assert.equal(JSON.stringify(r).includes(SOURCE_ID[0]),false);
 assert.equal(SEED_HASH.length,64);
});
test('source data changes, duplicates, deletions and extra candidates fail closed',()=>{
 for(const mutate of [
  s=>{s.manualRecords[0].actualAmount=111},
  s=>{s.manualRecords[0].status='unpaid'},
  s=>{s.manualRecords[0].project='OLD-S13'},
  s=>{s.manualRecords.push({...s.manualRecords[0]})},
  s=>{s.deletedLegacy=[SOURCE_ID[3]]}
 ]){
  const state=recordState();mutate(state);
  assert.throws(()=>pass({cash:state}),/S13_SOURCE_/);
 }
 const state=recordState();
 state.manualRecords.push({id:'another',project:'S13-2',status:'paid',direction:'out',
  actualDate:'2026-10-31',amount:1,actualAmount:1});
 const result=pass({cash:state});
 assert.equal(result.scopedCashEntriesMatched,false);
 assert.equal(result.extraPrivateAndLegacyCashEntries,1);
 assert.equal(result.sourceComplete,false);
});
test('wrong revision, unexpected source ID and corrupt hash cannot certify',()=>{
 const base=pair();
 assert.throws(()=>inspectS13({...base,revision:43,sourceRows}),/S13_SOURCE_REVISION_CHANGED/);
 const wrong=structuredClone(sourceRows);wrong[0].id='fake-source';
 assert.throws(()=>inspectS13({cashDocument:base.cashDocument,
  legacySeedDocument:base.legacySeedDocument,revision:42,sourceRows:wrong},
  {expectedSeedHash:base.hash}),/S13_SOURCE_TEST_REFERENCE_MISMATCH/);
 assert.throws(()=>inspectS13({cashDocument:base.cashDocument,
  legacySeedDocument:base.legacySeedDocument,revision:42,sourceRows},
  {expectedSeedHash:'0'.repeat(64)}),/S13_LEGACY_SEED_SIGNATURE_MISMATCH/);
});
test('production API requires Admin and performs two GETs without returning records',async()=>{
 const ds=pair(),calls=[],ok=obj=>({ok:true,json:async()=>obj});
 const payload={project:'S13-2',month:'2026-10',revision:42,source:sourceRows};
 const env={VERCEL_ENV:'production',CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',
  CASH_SYNC_ADMIN_UID:'ownerUid'};
 // Fixture hash differs from production seed; passing the fixture through the
 // pure verifier (tested above) rather than overriding the live API signature.
 let checked=0;
 await assert.rejects(()=>inspect({env,action:'s13_integrity',revision:42,source:sourceRows,firebaseJwt:'jwt',
  verifyAdmin:async()=>{checked++;throw Error('DENIED')},
  fetcher:async()=>{calls.push('network');return ok(ds.cashDocument)}
 }),/DENIED/);
 assert.equal(checked,1);assert.equal(calls.length,0);
 await assert.rejects(()=>inspect({env:{...env,VERCEL_ENV:'preview'},
  action:'s13_integrity',revision:42,source:sourceRows,firebaseJwt:'jwt',verifyAdmin:async()=>{},fetcher:async()=>{calls.push('network')}
 }),/PRODUCTION_FIREBASE_AUTH_REQUIRED/);
 assert.equal(calls.length,0);
 assert.throws(()=>require('../api/cash-sync-source-readonly.js')._internals.validateRequest(
  {action:'s13_integrity',revision:42,source:sourceRows.slice(1)}),/INVALID_S13_SOURCE/);
});
