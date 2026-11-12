'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {syncTest}=require('../site/assets/js/cash-shared-test-write-coordinator.js');
const planner=require('../site/assets/js/cash-shared-test-sync-planner.js');
const copy=x=>JSON.parse(JSON.stringify(x));
const target={isTestCopy:true,spreadsheetId:'test12345678901234567890123',title:'ELYSIAN CASH TEST COPY',
 tab:'DATA_CASHCONTROL_TEST_ELYSIAN',project:'ELYSIAN'};
const evidence={sourceComplete:true,historyComplete:true,baselineRevalidated:true};
const tx=(id='expense:001',amount=100)=>({sourceId:id,project:'ELYSIAN',
 date:'2026-11-03',company:'ACME',contractNo:'LAB-001',ipc:'IPC001',
 sourceType:'payment',amounts:[0,amount,0,0,0,0,0]});
function mock({history=[],mirror=[],openingBalance=1000,postEffect}={}){
 const store={history:copy(history),mirror:copy(mirror),openingBalance,revision:1,writes:0};
 return {store,
  transport:{
   async readSnapshot(){return copy({...store,spreadsheetId:target.spreadsheetId,
     tab:target.tab,project:'ELYSIAN'})},
   async appendRows(_target,rows,expected){
    if(postEffect)await postEffect(store);
    if(store.revision!==expected)throw Error('revision-conflict');
    store.mirror.push(...copy(rows));store.revision++;store.writes++;
   }
  }};
}
const execute=(transport,source=[tx()],extra={})=>syncTest({
 target,month:'2026-11',source,evidence,transport,planner,
 confirmed:true,exclusiveTestLock:true,...extra
});
test('non-PHU-HUNG TEST: one append with verified readback and balance',async()=>{
 const f=mock();
 const report=await execute(f.transport);
 assert.equal(report.status,'TEST_VERIFIED');
 assert.equal(report.balance,900);
 assert.equal(report.added,1);
 assert.equal(f.store.writes,1);
 const repeat=await execute(f.transport);
 assert.equal(repeat.status,'UNCHANGED');
 assert.equal(f.store.writes,1);
});
test('TEST: editing an already synced amount never overwrites manually edited rows',async()=>{
 const f=mock({mirror:[tx()]});
 await assert.rejects(execute(f.transport,[tx('expense:001',110)]),/MIRROR_CHANGED_SAME_ID/);
 assert.equal(f.store.writes,0);
});
test('TEST: historic duplicate from an old Google tab must not append',async()=>{
 const f=mock({history:[tx('historic-unknown')]});
 await assert.rejects(execute(f.transport),/HISTORY_CANDIDATE_NEEDS_ID/);
 assert.equal(f.store.writes,0);
});
test('TEST: stale revision refuses append',async()=>{
 const f=mock();
 let calls=0;
 const read=f.transport.readSnapshot;
 f.transport.readSnapshot=async (...args)=>{
  calls++;const snapshot=await read(...args);
  if(calls===2)f.store.revision++;
  return snapshot;
 };
 await assert.rejects(execute(f.transport),/TEST_SNAPSHOT_CHANGED/);
 assert.equal(f.store.writes,0);
});
test('TEST: unexpected Google timeout after append forces readback, no blind retry',async()=>{
 const f=mock({postEffect:store=>{store.mirror.push(tx());store.revision++;
   throw Error('Google timeout after write');}});
 await assert.rejects(execute(f.transport),/TEST_WRITE_UNCERTAIN_RECHECK_BEFORE_RETRY/);
 assert.equal(f.store.mirror.length,1);
});
test('TEST: postwrite human modifications detected and never reported verified',async()=>{
 const f=mock();
 let calls=0;
 const read=f.transport.readSnapshot;
 f.transport.readSnapshot=async (...args)=>{
  calls++;if(calls===3)f.store.mirror[0].amounts[1]=999;
  return read(...args);
 };
 await assert.rejects(execute(f.transport),/TEST_WRITE_READBACK_MISMATCH/);
});
test('TEST: cross-project and PHU HUNG destinations refused',async()=>{
 const f=mock();
 await assert.rejects(execute(f.transport,[tx()],{
   target:{...target,project:'PHU HUNG'}}),/TEST_TARGET_ONLY/);
 await assert.rejects(execute(f.transport,[tx()],{
   target:{...target,title:'ELYSIAN LIVE'}}),/TEST_TARGET_ONLY/);
 await assert.rejects(execute(f.transport,[tx()],{
   target:{...target,tab:'ELYSIAN'}}),/TEST_TARGET_ONLY/);
 assert.equal(f.store.writes,0);
});
test('TEST: no implicit permission from OAuth or Admin presence',async()=>{
 const f=mock();
 await assert.rejects(execute(f.transport,[tx()],{confirmed:false}),/TEST_WRITE_NOT_AUTHORIZED/);
 await assert.rejects(execute(f.transport,[tx()],{exclusiveTestLock:false}),/TEST_WRITE_NOT_AUTHORIZED/);
 assert.equal(f.store.writes,0);
});
test('TEST: source with unverified project transfer blocks whole batch',async()=>{
 const f=mock();const transfer={...tx('transfer:123:out'),sourceType:'transfer',
   counterpartVerified:false,amounts:[-200,0,0,0,0,0,0]};
 await assert.rejects(execute(f.transport,[tx(),transfer]),/TRANSFER_COUNTERPART_UNVERIFIED/);
 assert.equal(f.store.writes,0);
});
test('TEST: module cannot talk directly to Google, Firebase or production API',()=>{
 const code=fs.readFileSync(path.join(__dirname,
 '../site/assets/js/cash-shared-test-write-coordinator.js'),'utf8');
 assert.doesNotMatch(code,/\b(?:fetch|XMLHttpRequest|setDoc|updateDoc|addDoc|writeBatch)\s*\(/);
 assert.match(code,/productionApproved:false/);
});
