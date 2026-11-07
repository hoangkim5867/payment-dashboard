'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {buildEnvelope,validateEnvelope,ingestEnvelope,ORIGIN,DESTINATION}=
  require('../functions/cash-sync/relay-bridge.cjs');
const {gate,sendProductionEvent}=
  require('../functions/cash-relay/outbound.cjs');
const pay=(amount,month='2026-11-06',project='PHU HUNG')=>({
  project,processPaymentDate:month,processActualAmount:amount,
  company:'PRIVATE VENDOR',bankAccount:'DO NOT SHARE BANK',contractNo:'SECRET'
});
const prod={GCLOUD_PROJECT:ORIGIN,
  CASH_SHEETS_PRODUCTION_RELAY_ENABLED:'YES',
  CASH_SHEETS_RELAY_TARGET_PROJECT:DESTINATION,
  CASH_SHEETS_RELAY_TARGET_URL:'https://cash-sync-abc.a.run.app/'};
const staging={GCLOUD_PROJECT:DESTINATION,
  CASH_SHEETS_RELAY_INGEST_ENABLED:'YES'};
test('cross-project triggers share exact event selection rules, not separate accounting implementations',()=>{
  const root=resolve(__dirname,'..');
  for(const file of ['core.cjs','relay-bridge.cjs']){
    const source=readFileSync(resolve(root,'functions/cash-sync',file),'utf8');
    const relay=readFileSync(resolve(root,'functions/cash-relay',file),'utf8');
    assert.equal(relay,source,'production and staging event modules must stay identical');
  }
});
test('Payment change crosses projects as months and event identity, never money/bank or source JSON',()=>{
  const envelope=buildEnvelope({eventId:'cloudevent:001',source:'payment',
    before:pay(321000),after:pay(432100)});
  assert.equal(envelope.originProject,ORIGIN);
  assert.equal(envelope.project,'PHU HUNG');
  assert.deepEqual(envelope.months,['2026-11']);
  assert.match(envelope.jobId,/^[a-f0-9]{64}$/);
  assert.equal(validateEnvelope(envelope).id,envelope.jobId);
  for(const prohibited of ['432100','321000','PRIVATE VENDOR','DO NOT SHARE BANK','SECRET']){
    assert.ok(!JSON.stringify(envelope).includes(prohibited));
  }
  assert.equal(buildEnvelope({eventId:'unrelated',source:'payment',
    before:pay(1,'2026-11-06','EATON'),after:pay(2,'2026-11-06','EATON')}),null);
});
test('a linked PHU HUNG IPC receipt label change crosses projects without cash values',()=>{
  const receipt={id:'m1',linkedModule:'inflow',linkedRecordId:'receipt1',project:'PHU HUNG',
    status:'paid',actualDate:'2026-11-06',actualAmount:432100};
  const before={manualRecords:[receipt],inflowRecords:[{id:'receipt1',number:'IPC017'}]};
  const after={manualRecords:[{...receipt}],inflowRecords:[{id:'receipt1',number:'IPC018'}]};
  const envelope=buildEnvelope({eventId:'receipt-update-1',source:'cash-private',before,after});
  assert.deepEqual(envelope.months,['2026-11']);
  assert.ok(envelope.reasons.includes('inflow-linked-reference-changed'));
  assert.equal(envelope.needsReview,false);
  assert.equal(validateEnvelope(envelope).id,envelope.jobId);
  assert.ok(!JSON.stringify(envelope).includes('432100'));
});
test('moves across months report both old and new periods',()=>{
  const envelope=buildEnvelope({eventId:'move-1',source:'payment',
    before:pay(321000,'2026-10-31'),after:pay(321000,'2026-11-01')});
  assert.deepEqual(envelope.months,['2026-10','2026-11']);
});
test('staging intake is idempotent, one create write and zero read queries',async()=>{
  let reads=0,writes=0;
  const records=new Map();
  const writer={async create(collection,id,job){
    assert.equal(collection,'cash_sync_outbox');
    writes++;
    if(records.has(id))throw Object.assign(Error('exists'),{code:6});
    records.set(id,job);
  },async get(){reads++;}};
  const envelope=buildEnvelope({eventId:'repeat-same-id',source:'payment',
    before:pay(3),after:pay(4)});
  assert.equal((await ingestEnvelope({env:staging,envelope,writer})).status,'enqueued');
  assert.equal((await ingestEnvelope({env:staging,envelope,writer})).status,'duplicate');
  assert.equal(records.size,1);
  assert.equal(reads,0);
  assert.equal(writes,2,'duplicate create attempt is atomically rejected');
  assert.equal(records.get(envelope.jobId).status,'awaiting-reconciler');
});
test('production relay only sends on explicit approved project and private destination',async()=>{
  let sends=0;
  const sender=async(target,body)=>{
    sends++;assert.equal(target,prod.CASH_SHEETS_RELAY_TARGET_URL);
    assert.equal(body.project,'PHU HUNG');return {status:'enqueued'};
  };
  assert.equal((await sendProductionEvent({env:prod,eventId:'a',source:'payment',
    before:pay(4),after:pay(5),sender})).status,'enqueued');
  assert.equal(sends,1);
  assert.equal((await sendProductionEvent({env:{...prod,GCLOUD_PROJECT:DESTINATION},
    eventId:'other',source:'payment',before:pay(1),after:pay(2),sender})).status,'disabled');
  assert.equal(sends,1);
  assert.throws(()=>gate({...prod,CASH_SHEETS_RELAY_TARGET_PROJECT:'cscecmep-payment'}),/destination/);
  assert.throws(()=>gate({...prod,CASH_SHEETS_RELAY_TARGET_URL:'http://outside.example.com'}),/endpoint/);
  assert.throws(()=>gate({...prod,CASH_SHEETS_RELAY_TARGET_URL:'https://safe.a.run.app/elsewhere'}),/path/);
});
test('network or receiver failure propagates so source CloudEvent is retried',async()=>{
  await assert.rejects(sendProductionEvent({env:prod,eventId:'network-1',source:'payment',
    before:pay(1),after:pay(2),sender:async()=>{throw Error('timeout')}}),/timeout/);
  await assert.rejects(sendProductionEvent({env:prod,eventId:'network-1',source:'payment',
    before:pay(1),after:pay(2),sender:async()=>({status:'blocked'})}),/not acknowledge/);
});
test('unknown fields, forged id, insecure month or review bypass never enqueue',async()=>{
  const envelope=buildEnvelope({eventId:'bad-one',source:'cash-private',
    before:{manualRecords:[]},after:{manualRecords:[
      {id:'one',project:'PHU HUNG',actualDate:'2026-11-06',amount:300}]}});
  assert.ok(envelope);
  let writes=0;
  const writer={async create(){writes++}};
  const attempts=[
    {...envelope,rawPayment:{amount:123}},
    {...envelope,jobId:'0'.repeat(64)},
    {...envelope,originProject:'some-other-project'},
    {...envelope,months:['2026-09']},
    {...envelope,reasons:['invented']},
    {...envelope,needsReview:'false'}
  ];
  for(const bad of attempts){
    await assert.rejects(ingestEnvelope({env:staging,envelope:bad,writer}));
  }
  const flagged=buildEnvelope({eventId:'unknown-legacy',source:'cash-private',
    before:{legacyOverrides:{},manualRecords:[]},
    after:{legacyOverrides:{x:1},manualRecords:[
      {id:'review-source',project:'PHU HUNG',actualDate:'2026-11-06'}]}});
  assert.equal(flagged.needsReview,true);
  await assert.rejects(ingestEnvelope({env:staging,
    envelope:{...flagged,needsReview:false},writer}),/review/);
  assert.equal(writes,0);
  assert.equal((await ingestEnvelope({env:{
    ...staging,CASH_SHEETS_RELAY_INGEST_ENABLED:'NO'},envelope,writer})).status,'disabled');
  assert.equal(writes,0);
});
test('staging import endpoint is IAM PRIVATE, not exposed to unauthenticated users',()=>{
  const root=resolve(__dirname,'..');
  const index=readFileSync(resolve(root,'functions/cash-sync/index.cjs'),'utf8');
  assert.match(index,/exports\.ingestCashSyncEvent=onRequest\(/);
  assert.match(index,/invoker:'private'/);
  assert.match(index,/CASH_SHEETS_RELAY_INGEST_ENABLED/);
  const relay=readFileSync(resolve(root,'functions/cash-relay/index.cjs'),'utf8');
  assert.match(relay,/onDocumentWritten/);
  assert.match(relay,/CASH_SHEETS_PRODUCTION_RELAY_ENABLED/);
  assert.equal(relay.includes('getDoc('),false);
});
