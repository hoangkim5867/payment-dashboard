'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create,HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
const {syncTest}=require('../site/assets/js/cash-shared-test-write-coordinator.js');
const planner=require('../site/assets/js/cash-shared-test-sync-planner.js');
const target={isTestCopy:true,spreadsheetId:'TEST_SPREADSHEET_1234567890123456789',
 title:'ELYSIAN GOOGLE TEST COPY',tab:'DATA_CASHCONTROL_TEST_ELYSIAN',project:'ELYSIAN'};
const tx=(id='ELYSIAN:payment:1',amount=50)=>({sourceId:id,project:'ELYSIAN',
 date:'2026-11-05',sourceType:'payment',company:'VENDOR',
 contractNo:'SUBP-001',ipc:'IPC001',amounts:[0,amount,0,0,0,0,0]});
const cells=row=>[row.sourceId,row.project,row.date,row.sourceType,
 row.company,row.contractNo,row.ipc,...row.amounts];
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(opts={}){
 const state={mirror:clone(opts.mirror||[]),postCalls:0,reads:0,lock:true,failAfterPost:false,
  log:[],sheetTitle:opts.sheetTitle||target.title};
 const lock={assertHeld:async()=>{if(!state.lock)throw Error('TEST_LOCK_LOST')}};
 const request=async(path,{method='GET',body}={})=>{
  state.log.push({path,method});if(method==='GET')state.reads++;
  if(path.includes('?fields=spreadsheetId'))return {
   spreadsheetId:target.spreadsheetId,properties:{title:state.sheetTitle},
   sheets:[{properties:{title:target.tab,hidden:false}}]};
  if(method==='GET'&&path.includes('/values/')){
   return {values:[HEADER,...state.mirror.map(cells)]};
  }
  if(method==='POST'&&path.includes(':append')){
   state.postCalls++;
   state.mirror.push(...body.values.map(r=>({
    sourceId:r[0],project:r[1],date:r[2],sourceType:r[3],company:r[4],
    contractNo:r[5],ipc:r[6],amounts:r.slice(7,14)
   })));
   if(state.failAfterPost)throw Error('simulated Google 504');
   return {updates:{updatedRows:body.values.length}};
  }
  throw Error('Unexpected Google path '+path);
 };
 const transport=create({target,request,exclusiveLock:lock,openingBalance:1000,
  history:[],amountColumns:7});
 const sync=(source=[tx()])=>syncTest({target,month:'2026-11',source,
   evidence:{sourceComplete:true,historyComplete:true,baselineRevalidated:true},
   confirmed:true,exclusiveTestLock:true,transport,planner});
 return {state,transport,sync};
}
test('actual Google Sheets API path adapter: GET metadata + encoded TEST range + append',async()=>{
 const f=fixture();const x=await f.sync();
 assert.equal(x.status,'TEST_VERIFIED');assert.equal(x.balance,950);
 assert.equal(f.state.postCalls,1);
 assert.ok(f.state.log.some(x=>x.path.includes('%27DATA_CASHCONTROL_TEST_ELYSIAN%27!A1%3AO20000')));
 assert.ok(f.state.log.some(x=>x.method==='POST'&&x.path.includes(':append?valueInputOption=RAW')));
});
test('Google Sheets TEST API adapter: second run has no network write',async()=>{
 const f=fixture();await f.sync();const next=await f.sync();
 assert.equal(next.status,'UNCHANGED');assert.equal(f.state.postCalls,1);
});
test('Google Sheets TEST API adapter: if Google times out after append, require manual recheck',async()=>{
 const f=fixture();f.state.failAfterPost=true;
 await assert.rejects(f.sync(),/TEST_WRITE_UNCERTAIN_RECHECK_BEFORE_RETRY/);
 assert.equal(f.state.mirror.length,1);
 f.state.failAfterPost=false;
 const second=await f.sync();
 assert.equal(second.status,'UNCHANGED');
 assert.equal(f.state.postCalls,1);
});
test('Google Sheets TEST API adapter: mismatched file title stops before write',async()=>{
 const f=fixture({sheetTitle:'ELYSIAN LIVE'});
 await assert.rejects(f.sync(),/TEST_FILE_IDENTITY_CHANGED/);
 assert.equal(f.state.postCalls,0);
});
test('Google Sheets TEST API adapter: lost lock prevents Google append',async()=>{
 const f=fixture();f.state.lock=false;
 await assert.rejects(f.sync(),/TEST_LOCK_LOST/);
 assert.equal(f.state.postCalls,0);
});
test('Google Sheets TEST API adapter: manually edited mirror blocks changed source ID',async()=>{
 const f=fixture({mirror:[tx('ELYSIAN:payment:1',99)]});
 await assert.rejects(f.sync(),/MIRROR_CHANGED_SAME_ID/);
 assert.equal(f.state.postCalls,0);
});
test('Google Sheets TEST API adapter: separate tax column must preserve 8 buckets',async()=>{
 const records=[];const lock={assertHeld:async()=>{}};
 const target8={...target,tab:'DATA_CASHCONTROL_TEST_FOXCONN',project:'FOXCONN',
  title:'FOXCONN TEST SHEETS COPY'};
 const transport=create({target:target8,openingBalance:100,
  history:[],amountColumns:8,exclusiveLock:lock,
  request:async(path,{method}={})=>{
   if(path.includes('?fields=spreadsheetId'))return {
    spreadsheetId:target.spreadsheetId,properties:{title:target8.title},
    sheets:[{properties:{title:target8.tab}}]};
   if(method==='GET')return {values:[HEADER,...records]};
   throw Error('Unexpected write');
  }});
 const snapshot=await transport.readSnapshot();assert.equal(snapshot.mirror.length,0);
 assert.equal(snapshot.openingBalance,100);
});
test('Google Sheets TEST API adapter cannot accept production-like target',()=>{
 const lock={assertHeld:async()=>{}},request=async()=>({});
 for(const bad of [{...target,title:'ELYSIAN LIVE'}, {...target,isTestCopy:false},
  {...target,project:'PHU HUNG'}, {...target,tab:'DATA_CASHCONTROL'}]){
  assert.throws(()=>create({target:bad,request,exclusiveLock:lock,
   openingBalance:0,history:[],amountColumns:7}),/TEST_TARGET_ONLY/);
 }
});
