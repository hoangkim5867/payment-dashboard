'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeLock}=require('../server/cash-shared-test-firestore-lock.cjs');
const {readTargets,allowTarget}=require('../server/cash-shared-test-targets.cjs');
const authToken='a'.repeat(120);
function mockFirestore(){
 const docs=new Map();let seq=0,reads=0,writes=0;
 const fetcher=async(url,options)=>{
  const method=options?.method;
  if(method==='GET'){
   reads++;const name=url.slice('https://firestore.googleapis.com/v1/'.length);
   const value=docs.get(name);
   return value?{ok:true,json:async()=>value}:{ok:false,status:404};
  }
  if(method==='POST'){
   const body=JSON.parse(options.body),write=body.writes?.[0];
   const name=write?.update?.name||write?.delete;
   if(!name)return {ok:false,status:400};
   if(write?.update){
    if(docs.has(name)||write.currentDocument?.exists!==false)
      return {ok:false,status:409};
    const now='2026-11-12T10:00:'+String(++seq).padStart(2,'0')+'Z';
    docs.set(name,{name,updateTime:now,fields:write.update.fields});
    writes++;return {ok:true,json:async()=>({writeResults:[{updateTime:now}]})};
   }
   if(write.delete){
    const old=docs.get(name);
    if(!old||old.updateTime!==write.currentDocument?.updateTime)
      return {ok:false,status:409};
    docs.delete(name);writes++;
    return {ok:true,json:async()=>({writeResults:[{updateTime:old.updateTime}]})};
   }
  }
  return {ok:false,status:400};
 };
 return {fetcher,docs,get reads(){return reads},get writes(){return writes}};
}
const lock=(fetcher,project='cash-control-staging')=>makeLock({
 project,uid:'admin_test',token:authToken,fetcher});
test('Firestore staging creates lock atomically and rejects concurrent writers',async()=>{
 const store=mockFirestore();
 const a=await lock(store.fetcher).acquire('ELYSIAN');
 assert.equal(store.writes,1);
 await assert.rejects(lock(store.fetcher).acquire('ELYSIAN'),
  /TEST_LOCK_ACQUIRE_UNCERTAIN_OR_HELD/);
 await a.assertHeld();assert.equal(store.reads,1);
 await a.release();assert.equal(store.writes,2);
 await assert.rejects(a.assertHeld(),/TEST_LOCK_ALREADY_RELEASED/);
 const b=await lock(store.fetcher).acquire('ELYSIAN');
 await b.assertHeld();await b.release();
});
test('Lock rejects wrong owner and forbids automatic reclaim after network uncertainty',async()=>{
 const store=mockFirestore();
 const a=await lock(store.fetcher).acquire('FOXCONN');
 const record=[...store.docs.values()][0];record.fields.owner.stringValue='different';
 await assert.rejects(a.assertHeld(),/TEST_LOCK_LOST/);
 await assert.rejects(lock(store.fetcher).acquire('FOXCONN'),/TEST_LOCK_ACQUIRE_UNCERTAIN_OR_HELD/);
 assert.equal(store.writes,1,'no automatic deletion of possibly active lock');
});
test('Lock rejects prod, untrusted project, and arbitrary collections',()=>{
 const store=mockFirestore();
 assert.throws(()=>lock(store.fetcher,'cscecmep-payment'),/TEST_LOCK_CONFIG_INVALID/);
 assert.throws(()=>lock(store.fetcher,'some-other-project'),/TEST_LOCK_CONFIG_INVALID/);
 assert.throws(()=>makeLock({project:'cash-control-staging',uid:'admin_test',
  token:authToken,fetcher:store.fetcher,collection:'payments'}),/TEST_LOCK_CONFIG_INVALID/);
});
test('TEST file allowlist is exact; PHU HUNG and production rejected',()=>{
 const env={VERCEL_ENV:'preview',CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging',
  CASH_SYNC_MULTI_TEST_TARGETS_JSON:JSON.stringify([
   {project:'ELYSIAN',spreadsheetId:'A'.repeat(30),
    title:'ELYSIAN GOOGLE TEST COPY',tab:'DATA_CASHCONTROL_TEST_ELYSIAN'},
   {project:'FOXCONN',spreadsheetId:'B'.repeat(30),
    title:'FOXCONN GOOGLE TEST COPY',tab:'DATA_CASHCONTROL_TEST_FOXCONN'}])};
 const allowed=readTargets(env);
 assert.equal(allowTarget(allowed,'FOXCONN','B'.repeat(30),'DATA_CASHCONTROL_TEST_FOXCONN').project,'FOXCONN');
 assert.throws(()=>allowTarget(allowed,'FOXCONN','A'.repeat(30),'DATA_CASHCONTROL_TEST_FOXCONN'),/NOT_ALLOWLISTED/);
 assert.throws(()=>readTargets({...env,VERCEL_ENV:'production'}),/PRODUCTION_DISABLED/);
 assert.throws(()=>readTargets({...env,CASH_SYNC_MULTI_TEST_TARGETS_JSON:
  JSON.stringify([{project:'PHU HUNG',spreadsheetId:'A'.repeat(30),
   title:'PHU HUNG TEST',tab:'DATA_CASHCONTROL_TEST_PHU_HUNG'}])}),/ALLOWLIST_ENTRY/);
});
test('No target allowlist is a hard stop, never inferred from Google sheet URL',()=>{
 assert.throws(()=>readTargets({VERCEL_ENV:'preview',
   CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging'}),/ALLOWLIST_MISSING/);
});
