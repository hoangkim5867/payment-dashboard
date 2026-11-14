'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {audit}=require('../api/cash-shared-test-history-audit.js')._internals;
const {HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
const spreadsheetId='Q'.repeat(38);
const env={
 VERCEL_ENV:'preview',
 CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging',
 CASH_SYNC_ADMIN_UID:'test-admin-id',
 CASH_SYNC_MULTI_TEST_TARGETS_JSON:JSON.stringify([{
  project:'FOXCONN',spreadsheetId,title:'FOXCONN GOOGLE TEST',
  tab:'DATA_CASHCONTROL_TEST_FOXCONN'
 }])
};
const first=['2026-10-01','Vendor A','SUPL-001','Receipt','IPC001','收入',120,
  0,0,0,0,0,0,0,120];
const second=['2026-10-02','Vendor B','SUPL-002','Materials','IPC002','支出',0,
  0,20,0,0,0,0,0,100];
function fixture({rows=[first,second],wrongTitle=false,wrongHeader=false}={}){
 const log=[];
 const fetcher=async(url,options)=>{
  log.push({url,method:options?.method});
  if(url.includes('?fields=spreadsheetId'))return {
   ok:true,json:async()=>({
    spreadsheetId,properties:{title:wrongTitle?'FOXCONN LIVE':'FOXCONN GOOGLE TEST'},
    sheets:[{properties:{title:'FOXCONN',sheetId:1,hidden:false}},
      {properties:{title:'DATA_CASHCONTROL_TEST_FOXCONN',sheetId:2,hidden:false}}]
   })
  };
  if(url.includes('DATA_CASHCONTROL_TEST_FOXCONN'))
   return {ok:true,json:async()=>({values:[wrongHeader?['wrong']:HEADER]})};
  if(url.includes("'FOXCONN'"))return {
   ok:true,json:async()=>({values:[['Ngày','Company','Contract'],...rows]})
  };
  throw Error('Unexpected Google URL');
 };
 return {log,fetcher};
}
const opts=(f,over={})=>({
 env,project:'FOXCONN',firebaseJwt:'fake-jwt',googleToken:'x'.repeat(110),
 fetcher:f.fetcher,verifyAdmin:async(jwt,cfg)=>{
  assert.equal(jwt,'fake-jwt');assert.equal(cfg.uid,'test-admin-id');
 },...over
});
test('FOXCONN history TEST audits balance and no Google writes',async()=>{
 const f=fixture();
 const result=await audit(opts(f));
 assert.equal(result.historicalRows,2);
 assert.equal(result.closingBalance,100);
 assert.equal(result.googleReads,3);
 assert.equal(result.firestoreReads,0);
 assert.equal(result.writes,0);
 assert.equal(result.canWrite,false);
 assert.equal(result.originalUntouched,true);
 assert.ok(f.log.every(x=>x.method==='GET'));
 assert.ok(f.log.every(x=>x.url.includes(spreadsheetId)));
});
test('FOXCONN history drift blocks with no Google write',async()=>{
 const bad=[...second];bad[14]=101;
 const f=fixture({rows:[first,bad]});
 await assert.rejects(audit(opts(f)),/FOXCONN_TEST_HISTORY_BALANCE_REVIEW_REQUIRED/);
 assert.ok(f.log.every(x=>x.method==='GET'));
});
test('wrong title, header, or live environment rejected before mutation',async()=>{
 for(const x of [{wrongTitle:true},{wrongHeader:true}]){
  const f=fixture(x);
  await assert.rejects(audit(opts(f)),/FOXCONN_TEST_FILE_MISMATCH|FOXCONN_TEST_MACHINE_HEADER_MISMATCH/);
  assert.ok(f.log.every(z=>z.method==='GET'));
 }
 const f=fixture();
 await assert.rejects(audit(opts(f,{env:{...env,VERCEL_ENV:'production'}})),/TEST_PREVIEW_ONLY/);
 await assert.rejects(audit(opts(f,{project:'ELYSIAN'})),/ONLY_FOXCONN_TEST/);
 assert.equal(f.log.length,0);
});
