'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {run,SAMPLE}=require('../api/cash-shared-test-idempotency.js')._internals;
const {HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
const id='K'.repeat(36),secret='T'.repeat(160);
const baseEnv={VERCEL_ENV:'preview',CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging',
 CASH_SYNC_ADMIN_UID:'test-admin-owner',CASH_SYNC_MULTI_TEST_TARGETS_JSON:JSON.stringify([{
 project:'FOXCONN',spreadsheetId:id,title:'FOXCONN GOOGLE TEST',
 tab:'DATA_CASHCONTROL_TEST_FOXCONN'}])};
const row=(first=false)=>{
 const r=['2026-10-01','Vendor','CONTRACT','Historical','IPC','收入',
   first?35246364496:0,0,0,0,0,0,0,0,35246364496];
 return r;
};
function fixture({badHistory=false,foreign=false,mutateAfterWrite=false}={}){
 const history=[['Date','Company','Contract','Content','IPC','Type','Income'],...Array.from({length:271},(_,i)=>row(i===0))];
 if(badHistory)history[271][14]=35246364495;
 let machine=[HEADER.slice()];
 if(foreign)machine.push(['UNRELATED_USER_DATA']);
 const stats={reads:0,writes:0,writeRanges:[]};
 const fetcher=async(url,request={})=>{
  const method=request.method||'GET';
  if(!url.includes(id))throw Error('Wrong TEST spreadsheet');
  if(method==='POST'){
   stats.writes++;
   const input=JSON.parse(request.body);
   assert.ok(url.endsWith(':batchUpdate'));
   assert.equal(input.requests.length,1);
   const op=input.requests[0].updateCells;
   assert.ok(op);
   assert.equal(op.range.sheetId,9);
   assert.deepEqual(op.range,{sheetId:9,startRowIndex:1,endRowIndex:2,startColumnIndex:0,endColumnIndex:15});
   const cells=op.rows[0].values.map(x=>x.userEnteredValue.numberValue??x.userEnteredValue.stringValue);
   assert.deepEqual(cells,SAMPLE);
   stats.writeRanges.push(op.range);
   machine=[HEADER.slice(),cells];
   if(mutateAfterWrite)history[1][3]='CHANGED';
   return {ok:true,json:async()=>({replies:[{}]})};
  }
  stats.reads++;
  if(url.includes('fields=spreadsheetId'))return {ok:true,json:async()=>({
   spreadsheetId:id,properties:{title:'FOXCONN GOOGLE TEST'},
   sheets:[{properties:{sheetId:1,title:'FOXCONN',hidden:false,gridProperties:{rowCount:1000}}},
    {properties:{sheetId:9,title:'DATA_CASHCONTROL_TEST_FOXCONN',hidden:false,gridProperties:{rowCount:1000}}}]
  })};
  if(url.includes("'FOXCONN'!"))return {ok:true,json:async()=>({values:structuredClone(history)})};
  if(url.includes('DATA_CASHCONTROL_TEST_FOXCONN'))return {ok:true,json:async()=>({values:structuredClone(machine)})};
  throw Error('Unexpected Google range '+url);
 };
 return {fetcher,stats,history,machine:()=>machine};
}
const call=(f,action='preview',extra={})=>run({
 env:baseEnv,project:'FOXCONN',action,confirm:action==='commit'?'WRITE_TEST_SAMPLE_ONLY':undefined,
 firebaseJwt:'synthetic-jwt',googleToken:secret,fetcher:f.fetcher,
 verifyAdmin:async(jwt,config)=>{
  assert.equal(jwt,'synthetic-jwt');assert.equal(config.project,'cash-control-staging');
  assert.equal(config.uid,'test-admin-owner');
 },...extra});
test('preview returns 271-row history proof and performs zero writes',async()=>{
 const f=fixture();
 const p=await call(f);
 assert.equal(p.mode,'preview');
 assert.equal(p.historyTransactions,271);
 assert.equal(p.historyBalance,35246364496);
 assert.equal(p.needsTestWrite,true);
 assert.equal(p.sourceIsCashControl,false);
 assert.equal(p.googleWrites,0);
 assert.equal(p.firestoreReads,0);
 assert.equal(f.stats.writes,0);
});
test('one fixed test write, verified readback, second click creates no duplicate',async()=>{
 const f=fixture();
 const first=await call(f,'commit');
 assert.equal(first.mode,'verified');
 assert.equal(first.sampleRows,1);
 assert.equal(first.googleWrites,1);
 assert.equal(f.stats.writes,1);
 assert.equal(f.machine().length,2);
 const second=await call(f,'commit');
 assert.equal(second.mode,'unchanged');
 assert.equal(second.sampleRows,1);
 assert.equal(second.googleWrites,0);
 assert.equal(f.stats.writes,1);
 assert.deepEqual(f.machine()[1],SAMPLE);
});
test('unrelated machine tab rows, broken historical balance fail without writing',async()=>{
 const foreign=fixture({foreign:true});
 await assert.rejects(call(foreign,'commit'),/TEST_MACHINE_TAB_CONTAINS_OTHER_DATA/);
 assert.equal(foreign.stats.writes,0);
 const broken=fixture({badHistory:true});
 await assert.rejects(call(broken,'commit'),/FOXCONN_TEST_HISTORY_REVIEW_REQUIRED/);
 assert.equal(broken.stats.writes,0);
});
test('TEST production/staging boundary blocks before any Google read',async()=>{
 const f=fixture();
 await assert.rejects(call(f,'commit',{env:{...baseEnv,VERCEL_ENV:'production'}}),/TEST_PREVIEW_STAGING_ONLY/);
 await assert.rejects(call(f,'commit',{env:{...baseEnv,CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment'}}),/TEST_PREVIEW_STAGING_ONLY/);
 await assert.rejects(call(f,'commit',{project:'ELYSIAN'}),/ONLY_FOXCONN_TEST/);
 await assert.rejects(call(f,'commit',{confirm:undefined}),/TEST_SAMPLE_CONFIRMATION_REQUIRED/);
 assert.equal(f.stats.reads,0);assert.equal(f.stats.writes,0);
});
test('history changed after Google write reports uncertain and requires manual review',async()=>{
 const f=fixture({mutateAfterWrite:true});
 await assert.rejects(call(f,'commit'),/TEST_WRITE_UNCERTAIN_DO_NOT_RETRY/);
 assert.equal(f.stats.writes,1);
});

test('one-click pilot replay reads the verified repayment twice with no writes',async()=>{
 const f=fixture();
 await call(f,'commit');
 const sourceId='FOXCONN:transfer:cash-transaction-id:out';
 f.machine().push([sourceId,'FOXCONN','2026-10-26','TRANSFER','Điều chuyển nội bộ',
  null,'','-5700000000','0',0,0,0,0,0,0]);
 for(let i=0;i<2;i++){
  const p=await call(f,'preview',{sourceId:null});
  assert.equal(p.kind,'VERIFIED_FOXCONN_REPAYMENT_TEST');
  assert.equal(p.projectedBalance,29546364496);
  assert.equal(p.sampleRows,1);
  assert.equal(p.needsTestWrite,false);
  assert.equal(p.googleWrites,0);
 }
 assert.equal(f.stats.writes,1);
});


test('Google Values sparse final zero cells and date serial replay safely twice',async()=>{
 const f=fixture();
 await call(f,'commit');
 const sourceId='FOXCONN:transfer:verified-source-row:out';
 const dateSerial=Date.parse('2026-10-26T00:00:00Z')/86400000+25569;
 // Values API removes trailing empty cells. Preserve amount as textual
 // integer and date as serial, exactly as Google may return after a paste.
 f.machine().push([sourceId,'FOXCONN',dateSerial,'TRANSFER','Điều chuyển nội bộ',
   null,'','-5700000000']);
 for(let i=0;i<2;i++){
   const result=await call(f,'preview',{sourceId:null});
   assert.equal(result.projectedBalance,29546364496);
   assert.equal(result.sampleRows,1);
   assert.equal(result.googleWrites,0);
   assert.equal(result.needsTestWrite,false);
   assert.ok(result.googleRepresentations.some(x=>x.cell==='C3'&&
     x.googleType==='number'&&x.canonicalType==='string'));
   assert.ok(result.googleRepresentations.some(x=>x.cell==='H3'&&
     x.googleType==='string'&&x.canonicalType==='number'));
   assert.ok(result.googleRepresentations.some(x=>x.cell==='I3'&&
     x.googleType==='missing'&&x.canonicalType==='number'));
 }
 assert.equal(f.stats.writes,1);
 assert.equal(f.machine().length,3);
});
test('unexpected cell or extra row fails with a precise, value-free coordinate',async()=>{
 const f=fixture();
 await call(f,'commit');
 f.machine().push(['FOXCONN:transfer:verified-source-row:out','FOXCONN',
   '2026-10-26','TRANSFER','Điều chuyển nội bộ','','',-5699999999,
   0,0,0,0,0,0,0]);
 await assert.rejects(call(f,'preview',{sourceId:null}),err=>{
   assert.equal(err.message,'TEST_MACHINE_TAB_CONTAINS_OTHER_DATA');
   assert.deepEqual(err.diagnostic,{cell:'H3',actualType:'number',
     expectedType:'number',reason:'different_value_or_representation'});
   return true;
 });
 assert.equal(f.stats.writes,1);
 f.machine()[2][7]=-5700000000;
 f.machine().push(['UNRELATED_DATA']);
 await assert.rejects(call(f,'preview',{sourceId:null}),err=>{
   assert.equal(err.diagnostic?.cell,'A4');
   assert.equal(err.diagnostic?.reason,'row_missing_or_extra');
   return true;
 });
 assert.equal(f.stats.writes,1);
});
