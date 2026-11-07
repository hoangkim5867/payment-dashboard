'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {COLLECTION,DOCUMENT,FIELDS,projectedPayment,scope,
  mutatePaymentCache,readCache,createCacheStore}=require('../functions/cash-relay/source-cache.cjs');
const {bootstrapCache}=require('../functions/cash-relay/source-bootstrap.cjs');
const {projectExactCashMonth}=require('../functions/cash-sync/full-projector.cjs');
const date=n=>'2026-11-06T08:00:'+String(n).padStart(2,'0')+'.000Z';
const payment=(id,extra={})=>({id,project:'PHU HUNG',costType:'间接费',
  amount:321000,processActualAmount:321000,processPaymentDate:'2026-11-06',
  company:'VENDOR',contractNo:'C-1',ipcNo:'IPC017',
  bankAccount:'PRIVATE BANK NUMBER',uncPdf:'PRIVATE FILE',...extra});
const seed=()=>({LEGACY_SALARY:[],LEGACY_FINANCE:[],
  LEGACY_VNB:[],LEGACY_CASH_SPECIAL:[]});
const privateCash=()=>({manualRecords:[],salaryRecords:[],
  inflowRecords:[],legacyOverrides:{},deletedLegacy:[]});
const event=(id,value,n,old=null)=>({paymentId:id,before:old,
  after:value,eventId:'firestore-event-'+n,time:date(n)});
const baseRow=(id,amount)=>({id,data:payment(id,{amount,processActualAmount:amount}),
  updateTime:{seconds:1793952000,nanoseconds:0}});
test('single trusted project-scoped readTime bootstrap is not falsely certified as complete',()=>{
  const result=bootstrapCache({snapshotRows:[],readTime:date(0)});
  assert.equal(result.sourceRows,0);
  assert.equal(result.readyForFinancialWrites,false);
  assert.equal(result.state.complete,false);
  assert.equal(result.state.bootstrapCaptured,true);
  assert.throws(()=>readCache(result.state),/Incomplete/);
});
test('live event update and deletion preserve newest version, reject old and duplicate delivery',()=>{
  const initial=mutatePaymentCache(null,event('p1',payment('p1'),1));
  assert.equal(initial.changed,true);
  assert.equal(initial.state.complete,false);
  const updated=mutatePaymentCache(initial.state,event('p1',payment('p1',
    {amount:432100,processActualAmount:432100}),3));
  const stale=mutatePaymentCache(updated.state,event('p1',payment('p1'),2));
  assert.equal(stale.changed,false);
  assert.equal(stale.reason,'older-event');
  const duplicate=mutatePaymentCache(updated.state,event('p1',payment('p1'),3));
  assert.equal(duplicate.changed,false);
  assert.equal(duplicate.reason,'duplicate');
  const removed=mutatePaymentCache(updated.state,event('p1',null,4,
    payment('p1')));
  assert.equal(Object.values(removed.state.rows)[0].value,null);
  const late=mutatePaymentCache(removed.state,event('p1',payment('p1'),2));
  assert.equal(late.changed,false);
  assert.equal(Object.values(late.state.rows)[0].value,null);
});
test('verified bootstrap evidence survives a valid new Payment without a costly rescan',()=>{
  const old=payment('p1'),seeded=mutatePaymentCache(null,event('p1',old,1)).state;
  const verified={...seeded,sourceVerified:true,complete:true,
    bootstrapCaptured:true,baselineReadTime:date(0),
    baselineDigest:'b'.repeat(64)};
  assert.equal(readCache(verified).length,1);
  const changed=mutatePaymentCache(verified,event('p1',
    payment('p1',{amount:432100,processActualAmount:432100}),3,old));
  assert.equal(changed.changed,true);
  assert.equal(changed.state.sourceVerified,true);
  assert.equal(changed.state.complete,true);
  assert.equal(changed.state.baselineReadTime,date(0));
  assert.equal(readCache(changed.state)[0].processActualAmount,432100);
  const unsafe={...verified,sourceVerified:false};
  const needsReview=mutatePaymentCache(unsafe,event('p1',
    payment('p1',{amount:432100,processActualAmount:432100}),3,old));
  assert.equal(needsReview.state.complete,false,'CloudEvent cannot self-certify the cache');
  assert.throws(()=>readCache(needsReview.state),/Incomplete/);
});
test('Payment description-only and hidden bank changes do not write source cache',()=>{
  const base=payment('p1'),initial=mutatePaymentCache(null,event('p1',base,1));
  const updated=mutatePaymentCache(initial.state,event('p1',{
    ...base,bankAccount:'NEW PRIVATE BANK',uncPdf:'MOVED DOC'
  },2,base));
  assert.equal(updated.changed,false);
  assert.equal(updated.reason,'no-financial-source-change');
  const noteUpdated=mutatePaymentCache(initial.state,event('p1',{
    ...base,note:'投标保证金'
  },2,base));
  assert.equal(noteUpdated.changed,true,'notes can influence original accounting classification');
});
test('project movement removes one Payment without reading the entire company',()=>{
  const from=payment('p1'),to=payment('p1',{project:'EATON'});
  const old=mutatePaymentCache(null,event('p1',from,1));
  const changed=mutatePaymentCache(old.state,event('p1',to,2,from));
  assert.equal(changed.changed,true);
  assert.equal(Object.values(changed.state.rows)[0].value,null);
  assert.equal(mutatePaymentCache(changed.state,event('p2',payment('p2',
    {project:'FOXCONN'}),3)).changed,false);
});
test('project source cache never replicates bank, PDF, UNC or unrelated financial records',()=>{
  const raw=projectedPayment('p1',payment('p1'));
  assert.equal(raw.bankAccount,undefined);
  assert.equal(raw.uncPdf,undefined);
  assert.ok(FIELDS.every(x=>!/(bank|account|pdf|unc|file|attachment)/i.test(x)));
  assert.ok(!JSON.stringify(raw).includes('PRIVATE BANK NUMBER'));
  assert.ok(!JSON.stringify(raw).includes('PRIVATE FILE'));
});
test('a same-timestamp different event cannot silently overwrite bank-independent cache',()=>{
  const a=mutatePaymentCache(null,event('p1',payment('p1'),1));
  const conflict=mutatePaymentCache(a.state,{
    ...event('p1',payment('p1',{amount:100}),1),eventId:'another-event'});
  assert.equal(conflict.state.blocked,true);
  assert.throws(()=>readCache(conflict.state),/Incomplete/);
});
test('one-time bootstrap preserves events strictly newer than readTime',()=>{
  const pending=mutatePaymentCache(null,event('p1',payment('p1',
    {amount:432100,processActualAmount:432100}),4));
  const base=bootstrapCache({snapshotRows:[{
    id:'p1',data:payment('p1',{amount:321000,processActualAmount:321000}),
    updateTime:date(1)
  }],readTime:date(3),current:pending.state});
  assert.equal(base.pendingChangesKept,1);
  assert.equal(Object.values(base.state.rows)[0].value.processActualAmount,432100);
  assert.equal(base.state.complete,false);
  assert.throws(()=>readCache(base.state),/Incomplete/);
});
test('project snapshot cannot claim to be complete with untrusted scope/readTime',()=>{
  assert.throws(()=>bootstrapCache({
    snapshotRows:[{id:'p1',data:payment('p1',{project:'ELYSIAN'}),
      updateTime:date(1)}],readTime:date(2)}),/Non-PHU HUNG/);
  assert.throws(()=>bootstrapCache({
    snapshotRows:[{id:'p1',data:payment('p1'),updateTime:date(3)}],
    readTime:date(2)}),/newer/);
  assert.throws(()=>bootstrapCache({
    snapshotRows:[{id:'p1',data:payment('p1'),updateTime:date(1)},
      {id:'p1',data:payment('p1'),updateTime:date(1)}],
    readTime:date(2)}),/duplicate/);
});
test('source cache can feed exact original Cash Control projector, but only after external source verification',()=>{
  const unverified=mutatePaymentCache(null,event('p1',payment('p1'),1));
  assert.throws(()=>readCache(unverified.state),/Incomplete/);
  // This manual completion in fixture is for calculator parity only;
  // no real production code may assert source complete without bootstrap audit.
  const verified={...unverified.state,complete:true,sourceVerified:true,
    bootstrapCaptured:true,baselineReadTime:date(0),
    baselineDigest:'a'.repeat(64)};
  const rows=readCache(verified);
  assert.equal(rows.length,1);
  const projected=projectExactCashMonth({
    month:'2026-11',payments:rows,cashPrivate:privateCash(),
    legacySeed:seed()
  });
  assert.equal(projected.rows[0].values[10],321000);
  assert.equal(projected.authoritative,false,'read cache alone cannot activate writes');
});
test('native Firestore commit timestamp retains nanosecond order, unlike delivery arrival',()=>{
  const first=mutatePaymentCache(null,{paymentId:'p1',before:null,
    after:payment('p1'),eventId:'e1',
    time:{seconds:1793952000,nanoseconds:123456789}});
  const late=mutatePaymentCache(first.state,{paymentId:'p1',
    before:payment('p1'),after:payment('p1',{amount:100}),
    eventId:'older-delivery',time:{seconds:1793952000,nanoseconds:123456788}});
  assert.equal(late.changed,false);
  assert.equal(late.reason,'older-event');
  const newer=mutatePaymentCache(first.state,{paymentId:'p1',
    before:payment('p1'),after:payment('p1',{amount:200}),
    eventId:'newer-commit',time:{seconds:1793952000,nanoseconds:123456790}});
  assert.equal(newer.changed,true);
  assert.equal(Object.values(newer.state.rows)[0].value.amount,200);
});
test('verified cache survives actual financial edits but cannot self-certify an incomplete baseline',()=>{
  const baseline=mutatePaymentCache(null,event('p1',payment('p1'),1)).state;
  const verified={...baseline,complete:true,sourceVerified:true,
    bootstrapCaptured:true,baselineReadTime:date(0),baselineDigest:'a'.repeat(64)};
  const newer=mutatePaymentCache(verified,event('p1',
    payment('p1',{amount:432100,processActualAmount:432100}),2,payment('p1')));
  assert.equal(newer.state.complete,true);
  assert.equal(newer.state.sourceVerified,true);
  assert.equal(newer.state.bootstrapCaptured,true);
  assert.equal(newer.state.baselineReadTime,date(0));
  assert.equal(readCache(newer.state)[0].processActualAmount,432100);
  const incomplete=mutatePaymentCache(baseline,event('p1',
    payment('p1',{amount:432100,processActualAmount:432100}),2,payment('p1')));
  assert.equal(incomplete.state.complete,false);
  assert.throws(()=>readCache(incomplete.state),/Incomplete/);
});
test('a falsely marked complete cache without actual bootstrap provenance is rejected',()=>{
  const baseline=mutatePaymentCache(null,event('p1',payment('p1'),1)).state;
  for(const fake of [
    {...baseline,complete:true,sourceVerified:true,baselineDigest:'a'.repeat(64)},
    {...baseline,complete:true,sourceVerified:true,bootstrapCaptured:true,
      baselineDigest:'a'.repeat(64)},
    {...baseline,complete:true,sourceVerified:false,bootstrapCaptured:true,
      baselineReadTime:date(0),baselineDigest:'a'.repeat(64)}
  ])assert.throws(()=>readCache(fake),/Incomplete/);
});
test('atomic source-cache store reads and writes a single project doc, never scans payments',async()=>{
  const docs=new Map(),stats={reads:0,writes:0,queries:0};
  const db={
    collection(name){
      assert.equal(name,COLLECTION);
      return {doc(id){assert.equal(id,DOCUMENT);return {id}}};
    },
    async runTransaction(callback){
      const pending=[];
      const tx={async get(ref){stats.reads++;return {
        exists:docs.has(ref.id),data:()=>docs.get(ref.id)}},
        set(ref,data){pending.push([ref.id,data])}};
      const r=await callback(tx);
      for(const [id,data] of pending){docs.set(id,data);stats.writes++}
      return r;
    }
  };
  const store=createCacheStore(db);
  assert.equal((await store.apply(event('p1',payment('p1'),1))).status,'applied');
  assert.equal((await store.apply(event('p1',payment('p1'),1))).status,'duplicate');
  assert.equal(stats.reads,2);
  assert.equal(stats.writes,1);
  assert.equal(stats.queries,0);
});
test('source cache opt-in file is separate from the production Payment web',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../site/payment.html'),'utf8');
  assert.ok(!html.includes('CASH_SHEETS_PRODUCTION_CACHE_ENABLED'));
});
