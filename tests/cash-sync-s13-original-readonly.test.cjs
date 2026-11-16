'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect,validRequest,summarizeHistory,BASELINE}=require(
 '../api/cash-sync-s13-original-readonly.js')._internals;
const ID='1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg',GID=1543850344;
const meta={spreadsheetId:ID,sheets:[{properties:{sheetId:GID,title:"Original book"}}]};
const historical=()=>Array.from({length:258},(_,i)=>[
 i===41||i===141?'2026-09-29':'2026-09-30',
 'Existing book','','Prior posting','','间接费',
 0,0,0,0,0,0,0,BASELINE]);
const env={VERCEL_ENV:'production',CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',
 CASH_SYNC_ADMIN_UID:'trusted-admin'};
const body={project:'S13-2',month:'2026-10'};
const ok=data=>({ok:true,json:async()=>structuredClone(data)});
const inspectFixture=async(extra={})=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method,authorization:options.headers.Authorization});
  return ok(calls.length===1?extra.meta||meta:{values:extra.history||historical()});
 };
 const result=await inspect({env:extra.env||env,body:extra.body||body,
  firebaseJwt:'signed-owner-token',googleToken:'g'.repeat(64),
  verifyAdmin:async(jwt,config)=>{
   assert.equal(jwt,'signed-owner-token');
   assert.equal(config.uid,'trusted-admin');
  },fetcher});
 return {result,calls};
};
test('real-original proof is two Google GETs, zero writes, no sourceComplete',async()=>{
 const {result,calls}=await inspectFixture();
 assert.equal(result.reviewStatus,'HISTORY_BASELINE_MATCHED');
 assert.equal(result.historyTransactions,258);
 assert.equal(result.historyClosingBalance,BASELINE);
 assert.equal(result.octoberHistoryRows,0);
 assert.equal(result.dateInversions,2);
 assert.equal(result.expectedClosingIfSourceVerified,-72663856);
 assert.equal(result.sourceComplete,false);
 assert.equal(result.canSync,false);
 assert.equal(result.writeAuthorized,false);
 assert.equal(result.googleWrites,0);
 assert.deepEqual(calls.map(x=>x.method),['GET','GET']);
 assert.ok(calls.every(x=>x.authorization==='Bearer '+'g'.repeat(64)));
 assert.ok(calls[0].url.includes(ID));
 assert.ok(decodeURIComponent(calls[1].url).includes("'Original book'!A1:O20000"));
 assert.ok(!JSON.stringify(result).includes('Existing book'));
});
test('mismatched original balance cannot be reported as matched',()=>{
 const raw=historical();raw[257][13]=BASELINE-1;
 assert.throws(()=>summarizeHistory(meta,{values:raw}),/GOOGLE_ORIGINAL_BALANCE_AUDIT_FAILED/);
 const changed=historical().map(x=>[...x.slice(0,13),BASELINE+1]);
 const result=summarizeHistory(meta,{values:changed});
 assert.equal(result.originalHistoryMatched,false);
 assert.equal(result.reviewStatus,'HISTORY_REVIEW_REQUIRED');
 assert.equal(result.canSync,false);
});
test('date inversion changes, unexpected October or 259 rows block',()=>{
 const changed=historical();changed[41][0]='2026-09-30';
 assert.equal(summarizeHistory(meta,{values:changed}).originalHistoryMatched,false);
 const inMonth=historical();inMonth[257][0]='2026-10-01';
 assert.equal(summarizeHistory(meta,{values:inMonth}).originalHistoryMatched,false);
 assert.equal(summarizeHistory(meta,{values:[...historical(),historical()[0]]}).originalHistoryMatched,false);
});
test('wrong Google file, hidden/incorrect historical tab and missing data fail closed',()=>{
 assert.throws(()=>summarizeHistory({...meta,spreadsheetId:'bad'},{values:historical()}),
   /GOOGLE_ORIGINAL_FILE_NOT_VERIFIED/);
 assert.throws(()=>summarizeHistory({...meta,sheets:[]},{values:historical()}),
   /GOOGLE_ORIGINAL_GID_NOT_VERIFIED/);
 assert.throws(()=>summarizeHistory({...meta,sheets:[{properties:{
  sheetId:GID,title:'DATA_CASHCONTROL'}}]},{values:historical()}),
  /GOOGLE_ORIGINAL_GID_NOT_VERIFIED/);
 assert.throws(()=>summarizeHistory(meta,{values:null}),/GOOGLE_ORIGINAL_HISTORY_INVALID/);
});
test('only S13-2 October and production owner JWT are accepted before Google GET',async()=>{
 assert.throws(()=>validRequest({project:'FOXCONN',month:'2026-10'}),/S13_SCOPE_ONLY/);
 assert.throws(()=>validRequest({project:'S13-2',month:'2026-11'}),/S13_SCOPE_ONLY/);
 let reads=0;
 await assert.rejects(inspect({env:{...env,VERCEL_ENV:'preview'},body,
  googleToken:'g'.repeat(64),verifyAdmin:async()=>{},
  fetcher:async()=>{reads++;return ok(meta)}}),/PRODUCTION_ADMIN_REQUIRED/);
 await assert.rejects(inspect({env,body,googleToken:'g'.repeat(64),
  verifyAdmin:async()=>{throw Error('DENIED')},
  fetcher:async()=>{reads++;return ok(meta)}}),/DENIED/);
 assert.equal(reads,0);
});
