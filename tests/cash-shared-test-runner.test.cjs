'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runGuardedTestSync}=require('../server/cash-shared-test-runner.cjs');
const spreadsheetId='E'.repeat(35);
const target={project:'ELYSIAN',spreadsheetId,
 title:'ELYSIAN GOOGLE TEST COPY',tab:'DATA_CASHCONTROL_TEST_ELYSIAN'};
const env={VERCEL_ENV:'preview',CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging',
 CASH_SYNC_ADMIN_UID:'admin-test-001',
 CASH_SYNC_MULTI_TEST_TARGETS_JSON:JSON.stringify([target])};
const firebaseJwt='a'.repeat(160),googleToken='b'.repeat(64);
const tx={sourceId:'ELYSIAN:expense:001',project:'ELYSIAN',
 date:'2026-11-03',sourceType:'payment',company:'VENDOR',
 contractNo:'LAB-001',ipc:'IPC001',amounts:[0,25,0,0,0,0,0]};
const header=['sourceId','project','date','sourceType','company','contractNo',
 'ipc','income','subcontract','material','otherDirect','indirect',
 'financial','otherPayable','importTaxVat'];
function fixture({failAppend=false}={}){
 const state={locks:new Map(),mirror:[],writes:0,firestoreWrites:0,reads:0,
   googleCalls:0,failAppend};
 const fetcher=async(url,options={})=>{
  if(url.startsWith('https://firestore.googleapis.com/')){
   const prefix='https://firestore.googleapis.com/v1/';
   if(options.method==='GET'){
    const name=url.slice(prefix.length),entry=state.locks.get(name);
    return entry?{ok:true,json:async()=>entry}:{ok:false,status:404};
   }
   const payload=JSON.parse(options.body),op=payload.writes[0];
   if(op.update){
    if(state.locks.has(op.update.name))return {ok:false,status:409};
    const data={name:op.update.name,
      updateTime:'2026-11-12T10:10:01Z',fields:op.update.fields};
    state.locks.set(op.update.name,data);state.firestoreWrites++;
    return {ok:true,json:async()=>({writeResults:[{updateTime:data.updateTime}]})};
   }
   if(op.delete){
    const current=state.locks.get(op.delete);
    if(!current||current.updateTime!==op.currentDocument.updateTime)
      return {ok:false,status:409};
    state.locks.delete(op.delete);state.firestoreWrites++;
    return {ok:true,json:async()=>({writeResults:[{updateTime:current.updateTime}]})};
   }
  }
  if(url.startsWith('https://sheets.googleapis.com/')){
   state.googleCalls++;
   if(url.includes('?fields=spreadsheetId'))return {ok:true,json:async()=>({
    spreadsheetId,properties:{title:target.title},
    sheets:[{properties:{title:target.tab,hidden:false}}]})};
   if(options.method==='GET')return {ok:true,json:async()=>({values:[
    header,...state.mirror.map(r=>[r.sourceId,r.project,r.date,r.sourceType,
      r.company,r.contractNo,r.ipc,...r.amounts])
   ]})};
   if(options.method==='POST'&&url.includes(':append')){
    const input=JSON.parse(options.body);
    state.writes++;
    state.mirror.push(...input.values.map(row=>({
      sourceId:row[0],project:row[1],date:row[2],
      sourceType:row[3],company:row[4],contractNo:row[5],
      ipc:row[6],amounts:row.slice(7,14)})));
    if(state.failAppend)throw Error('timeout after successful commit');
    return {ok:true,json:async()=>({updates:{updatedRows:input.values.length}})};
   }
  }
  return {ok:false,status:400};
 };
 const params={env,firebaseJwt,googleToken,project:'ELYSIAN',
  month:'2026-11',targetId:spreadsheetId,tab:target.tab,confirmed:true,
  trustedSnapshot:async()=>({source:[tx],history:[],openingBalance:1000,
    sourceComplete:true,historyComplete:true,baselineRevalidated:true}),
  fetcher,verifyAdmin:async(jwt,conf)=>{
    assert.equal(jwt,firebaseJwt);assert.equal(conf.project,'cash-control-staging');
  }};
 return {state,params};
}
test('server TEST runner: separate Firestore lock + Google REST append/readback',async()=>{
 const f=fixture();
 const once=await runGuardedTestSync(f.params);
 assert.equal(once.status,'TEST_VERIFIED');assert.equal(once.balance,975);
 assert.equal(f.state.writes,1);assert.equal(f.state.locks.size,0);
 assert.equal(f.state.firestoreWrites,2);
 const again=await runGuardedTestSync(f.params);
 assert.equal(again.status,'UNCHANGED');assert.equal(f.state.writes,1);
 assert.equal(f.state.locks.size,0);
});
test('server TEST runner: missing trusted source blocks before touching Google',async()=>{
 const f=fixture();
 await assert.rejects(runGuardedTestSync({...f.params,trustedSnapshot:null}),
  /SHARED_TEST_TRUSTED_SOURCE_REQUIRED/);
 assert.equal(f.state.firestoreWrites,0);assert.equal(f.state.googleCalls,0);
});
test('server TEST runner: no history proof means fail-closed and lock released',async()=>{
 const f=fixture();
 await assert.rejects(runGuardedTestSync({...f.params,
  trustedSnapshot:async()=>({source:[tx],history:[],openingBalance:1000,
    sourceComplete:true,historyComplete:false,baselineRevalidated:true})}),
 /SHARED_TEST_SOURCE_NOT_PROVEN/);
 assert.equal(f.state.writes,0);assert.equal(f.state.locks.size,0);
});
test('server TEST runner: uncertain Sheets response freezes lock for manual inspection',async()=>{
 const f=fixture({failAppend:true});
 await assert.rejects(runGuardedTestSync(f.params),
  /TEST_WRITE_UNCERTAIN_RECHECK_BEFORE_RETRY/);
 assert.equal(f.state.writes,1);
 assert.equal(f.state.locks.size,1,'do not release lock when Google may have committed');
 await assert.rejects(runGuardedTestSync(f.params),/TEST_LOCK_ACQUIRE_UNCERTAIN_OR_HELD/);
 assert.equal(f.state.writes,1);
});
test('server TEST runner: production, unknown file and PHU HUNG are rejected',async()=>{
 const f=fixture();
 await assert.rejects(runGuardedTestSync({...f.params,env:{...env,VERCEL_ENV:'production'}}),
 /SHARED_TEST_PREVIEW_ONLY/);
 await assert.rejects(runGuardedTestSync({...f.params,targetId:'F'.repeat(35)}),
 /MULTI_TEST_TARGET_NOT_ALLOWLISTED/);
 await assert.rejects(runGuardedTestSync({...f.params,project:'PHU HUNG'}),
 /MULTI_TEST_TARGET_NOT_ALLOWLISTED/);
 assert.equal(f.state.firestoreWrites,0);assert.equal(f.state.googleCalls,0);
});
