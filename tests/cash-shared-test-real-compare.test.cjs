'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compareSourceToHistory,validateSource,run}=require('../api/cash-shared-test-real-compare.js')._internals;
const {sha,parseValues}=require('../server/cash-sync-multi-project-core.cjs');
const closing=35246364496;
const env={VERCEL_ENV:'preview',CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging',
 CASH_SYNC_ADMIN_UID:'test-owner',
 CASH_SYNC_MULTI_TEST_TARGETS_JSON:JSON.stringify([{
  project:'FOXCONN',spreadsheetId:'Z'.repeat(32),
  title:'FOXCONN GOOGLE TEST',tab:'DATA_CASHCONTROL_TEST_FOXCONN'
 }])};
const fileId='Z'.repeat(32);
function valueRow(i,date='2026-11-01'){
 return [date,'Vendor '+i,'CONTRACT-'+i,'Item '+i,'IPC'+i,'支出',
    0,0,0,0,0,0,0,0];
}
function history(){
 return [['Ngày','Company','Contract','Content','IPC','Type','Thu','LAB','SUB',
  'Material','Other','Indirect','Fin','Import','Balance'],
  ...Array.from({length:271},(_,i)=>[...valueRow(i,
    i===0?'2026-11-10':'2026-11-01'),closing])];
}
function rec(i,vals,sourceClass='CASH'){
 const values=parseValues(vals,{foxconn:true});
 return {id:'source:'+i,project:'FOXCONN',month:'2026-11',
  values,hash:sha(values),sourceClass};
}
const sourceValid=(rows)=>validateSource({
 project:'FOXCONN',month:'2026-11',source:rows
});
test('real-format source comparing baseline history produces review and zero writes',()=>{
 const raw=history(),rows=sourceValid([
  rec(1,raw[2].slice(0,14)),
  rec(2,valueRow(501,'2026-11-12')),
  rec(3,valueRow(502,'2026-11-03'))
 ]);
 const out=compareSourceToHistory(rows,raw,'2026-11');
 assert.equal(out.historyTransactions,271);
 assert.equal(out.closingBalance,closing);
 assert.equal(out.exactHistoryMatched,1);
 assert.equal(out.newAfterHistoryCandidates,1);
 assert.equal(out.olderUnmatched,1);
 assert.equal(out.coreStatus,'REVIEW_REQUIRED');
 assert.equal(out.canSync,false);
 assert.equal(out.canWrite,false);
 assert.equal(out.sourceComplete,false);
 assert.equal(out.googleWrites,0);
 assert.equal(out.firestoreReads,0);
 assert.deepEqual(out.issues.map(x=>x.reason),
  ['NEWER_THAN_HISTORY_CANDIDATE','UNMATCHED_BEFORE_LAST_HISTORY_DATE']);
});
test('historical duplicate collision is not silently merged',()=>{
 const raw=history();
 raw[12]=[...raw[11]];
 const out=compareSourceToHistory(sourceValid([rec(1,raw[11].slice(0,14))]),raw,'2026-11');
 assert.equal(out.ambiguousMatches,1);
 assert.equal(out.exactHistoryMatched,0);
 assert.equal(out.canWrite,false);
 assert.equal(out.issues[0].reason,'AMBIGUOUS_HISTORY');
});
test('invalid source IDs, hashes, months and mutated history block before writes',()=>{
 const raw=history();
 const good=rec(1,raw[1].slice(0,14));
 assert.throws(()=>sourceValid([]),/FOXCONN_TEST_SOURCE_NOT_READY/);
 assert.throws(()=>sourceValid([{...good,hash:'0'.repeat(64)}]),/FOXCONN_TEST_SOURCE_HASH_OR_DATE_INVALID/);
 assert.throws(()=>sourceValid([good,good]),/FOXCONN_TEST_SOURCE_ID_OR_MONTH_INVALID/);
 assert.throws(()=>validateSource({project:'FOXCONN',month:'2026-10',source:[good]}),/FOXCONN_TEST_SOURCE_ID_OR_MONTH_INVALID/);
 raw[271][14]=closing-1;
 assert.throws(()=>compareSourceToHistory(sourceValid([good]),raw,'2026-11'),/FOXCONN_TEST_HISTORY_BASELINE_CHANGED|Sổ Google|Lịch sử Google lệch số dư/);
});
test('server allows only Google GET for allowlisted TEST copy and staging Admin JWT',async()=>{
 const raw=history(),source=sourceValid([rec(1,raw[2].slice(0,14))]);
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,method:options.method});
  assert.ok(url.includes(fileId));
  if(url.includes('?fields=spreadsheetId'))
    return {ok:true,json:async()=>({
     spreadsheetId:fileId,properties:{title:'FOXCONN GOOGLE TEST'},
     sheets:[{properties:{title:'FOXCONN',sheetId:8,hidden:false}},
       {properties:{title:'DATA_CASHCONTROL_TEST_FOXCONN',sheetId:9,hidden:false}}]
    })};
  if(url.includes('FOXCONN')&&url.includes('/values/'))
    return {ok:true,json:async()=>({values:raw})};
  throw Error('Unexpected Google GET');
 };
 const runOpts={env,project:'FOXCONN',month:'2026-11',source,
  firebaseJwt:'synthetic-admin',googleToken:'X'.repeat(100),fetcher,
  verifyAdmin:async(jwt,cfg)=>{
    assert.equal(jwt,'synthetic-admin');
    assert.equal(cfg.project,'cash-control-staging');
  }};
 const out=await run(runOpts);
 assert.equal(out.sourceRows,1);
 assert.equal(out.googleReads,2);
 assert.equal(out.googleWrites,0);
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.method==='GET'));
 assert.ok(calls.every(x=>!x.url.includes(':batchUpdate')));
 const prior=calls.length;
 await assert.rejects(run({...runOpts,env:{...env,VERCEL_ENV:'production'}}),/ONLY_STAGING_TEST_PREVIEW/);
 assert.equal(calls.length,prior);
});

test('Payment without contract/IPC and interproject transfers never qualify as new automatic rows',()=>{
 const raw=history();
 const payment=valueRow(800,'2026-11-12');payment[2]='';payment[4]='';
 const transfer=valueRow(801,'2026-11-12');
 const a=sourceValid([rec(5,payment,'PAYMENT'),rec(6,transfer,'TRANSFER')]);
 const out=compareSourceToHistory(a,raw,'2026-11');
 assert.equal(out.missingPaymentIdentity,1);
 assert.equal(out.transferCounterpartsUnverified,1);
 assert.deepEqual(out.issues.map(x=>x.reason),
  ['PAYMENT_CONTRACT_IPC_MISSING','TRANSFER_COUNTERPART_UNVERIFIED']);
 assert.equal(out.canSync,false);assert.equal(out.canWrite,false);
 assert.equal(out.googleWrites,0);
});
test('unclassified source is reported, never assumed a verified Payment',()=>{
 const raw=history();
 const row=rec(50,raw[2].slice(0,14),'UNKNOWN');
 const out=compareSourceToHistory(sourceValid([row]),raw,'2026-11');
 assert.equal(out.sourceKindUnverified,1);
 assert.equal(out.issues[0].reason,'SOURCE_KIND_UNVERIFIED');
 assert.equal(out.canWrite,false);
});

test('unverified transfer, unknown type and incomplete Payment do not inflate candidate or matched counts',()=>{
 const raw=history();
 const missing=valueRow(810,'2026-11-12');missing[2]='';missing[4]='';
 const rows=sourceValid([
  rec(1,missing,'PAYMENT'),
  rec(2,valueRow(811,'2026-11-12'),'TRANSFER'),
  rec(3,valueRow(812,'2026-11-12'),'UNKNOWN'),
  rec(4,raw[2].slice(0,14),'TRANSFER'),
  rec(5,raw[3].slice(0,14),'MIXED'),
  rec(6,raw[4].slice(0,14),'PAYROLL')
 ]);
 const out=compareSourceToHistory(rows,raw,'2026-11');
 assert.equal(out.newAfterHistoryCandidates,0);
 assert.equal(out.exactHistoryMatched,1); // payroll is not an incomplete Payment
 assert.equal(out.missingPaymentIdentity,1);
 assert.equal(out.transferCounterpartsUnverified,2);
 assert.equal(out.sourceKindUnverified,2);
 assert.equal(out.coreChanges,0);
 assert.equal(out.coreStatus,'REVIEW_REQUIRED');
 assert.equal(out.googleWrites,0);
 assert.equal(out.canWrite,false);
});
