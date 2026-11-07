'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {mutatePaymentCache}=require('../functions/cash-relay/source-cache.cjs');
const {isSourceAuthorized,createCanonicalSourceReader,requireRequest}=
  require('../functions/cash-relay/canonical-source-reader.cjs');
const project='PHU HUNG',month='2026-11';
const env={GCLOUD_PROJECT:'cscecmep-payment',
  CASH_SHEETS_PRODUCTION_SOURCE_READ_ENABLED:'YES'};
const data={project,costType:'间接费',amount:321000,
  processActualAmount:321000,processPaymentDate:'2026-11-06',
  company:'Vendor',contractNo:'C-001',ipcNo:'IPC017',
  bankAccount:'SECRET BANK ACCOUNT'};
function fixture({verified=true,missing=null}={}){
  const event={paymentId:'P1',before:null,after:data,
    time:'2026-11-06T01:02:03Z',eventId:'test-evt'};
  const initial=mutatePaymentCache(null,event).state;
  const cache={...initial,complete:verified,sourceVerified:verified,
    bootstrapCaptured:verified,baselineDigest:'a'.repeat(64)};
  const docs={
    'cash_sync_source_cache/PHU_HUNG':cache,
    'cash_control_private/lehoangoanh':{revision:3,manualRecords:[],
      salaryRecords:[],inflowRecords:[],legacyOverrides:{},deletedLegacy:[]},
    'cash_control_private/legacy_seed_20261021_v1':{schemaVersion:1,
      payload:'PRIVATE',sha256:'a'.repeat(64)}
  };
  if(missing)delete docs[missing];
  const stats={reads:[],writes:0,transactions:0};
  const db={
    collection(collection){
      return {doc(id){return {id,collection,path:collection+'/'+id}}};
    },
    async runTransaction(fn,opts){
      assert.equal(opts.readOnly,true);
      stats.transactions++;
      return fn({
        async get(ref){
          stats.reads.push(ref.path);
          return {exists:Object.hasOwn(docs,ref.path),
            data:()=>docs[ref.path]};
        },
        set(){stats.writes++},update(){stats.writes++},delete(){stats.writes++}
      });
    }
  };
  const verifySeed=()=>({integrityVerified:true,digest:'a'.repeat(64),
    history:{LEGACY_SALARY:[],LEGACY_FINANCE:[],LEGACY_VNB:[],
      LEGACY_CASH_SPECIAL:[]}});
  return {db,docs,stats,verifySeed};
}
test('source read endpoint is disabled in staging, missing gate and arbitrary month/project',()=>{
  for(const bad of [
    {GCLOUD_PROJECT:'cash-control-staging',CASH_SHEETS_PRODUCTION_SOURCE_READ_ENABLED:'YES'},
    {GCLOUD_PROJECT:'cscecmep-payment',CASH_SHEETS_PRODUCTION_SOURCE_READ_ENABLED:'NO'}
  ])assert.equal(isSourceAuthorized(bad),false);
  assert.throws(()=>requireRequest({env,project:'ELYSIAN',month}),/unavailable/);
  assert.throws(()=>requireRequest({env,project,month:'2026-02'}),/unavailable/);
  assert.doesNotThrow(()=>requireRequest({env,project,month}));
});
test('complete source is built from three consistent reads using the original Cash Control exporter',async()=>{
  const f=fixture();
  const reader=createCanonicalSourceReader({db:f.db,verifySeed:f.verifySeed});
  const res=await reader({project,month});
  assert.equal(res.authoritative,true);
  assert.equal(res.sourceComplete,true);
  assert.equal(res.sourceReads,3);
  assert.equal(res.rows.length,1);
  assert.equal(res.rows[0].values[10],321000);
  assert.equal(res.rows[0].values[12],0);
  assert.equal(res.rows[0].id,'PHU HUNG:expense:pay_P1');
  assert.match(res.sourceProof,/^[a-f0-9]{64}$/);
  assert.equal(f.stats.reads.length,3);
  assert.equal(f.stats.writes,0);
  assert.equal(f.stats.transactions,1);
  assert.ok(!JSON.stringify(res).includes('SECRET BANK ACCOUNT'));
  assert.ok(!JSON.stringify(res).includes('PRIVATE'));
});
test('uncertified cache blocks even when source documents exist and have safe shapes',async()=>{
  const f=fixture({verified:false});
  const reader=createCanonicalSourceReader({db:f.db,verifySeed:f.verifySeed});
  await assert.rejects(reader({project,month}),/bootstrap audit/);
  assert.equal(f.stats.writes,0);
});
test('missing Cash Control document causes closed failure without any Sheets operation',async()=>{
  const f=fixture({missing:'cash_control_private/lehoangoanh'});
  await assert.rejects(
    createCanonicalSourceReader({db:f.db,verifySeed:f.verifySeed})({project,month}),
    /protected documents missing/);
  assert.equal(f.stats.writes,0);
});
test('malformed legacy seed fails before financial rows can leave production',async()=>{
  const f=fixture();
  const reader=createCanonicalSourceReader({db:f.db,
    verifySeed:()=>{throw Error('Protected history SHA256 mismatch')}});
  await assert.rejects(reader({project,month}),/SHA256 mismatch/);
  assert.equal(f.stats.writes,0);
});
test('production and TEST exact financial source modules remain byte-for-byte identical',()=>{
  const root=path.resolve(__dirname,'..');
  for(const name of ['three-way.cjs','export-kernel.cjs','exact-source-runtime.cjs',
    'full-projector.cjs','protected-history.cjs']){
    const stage=fs.readFileSync(path.join(root,'functions/cash-sync',name),'utf8');
    const production=fs.readFileSync(path.join(root,'functions/cash-relay',name),'utf8');
    assert.equal(production,stage,name+' changed independently');
  }
  const relay=fs.readFileSync(path.join(root,'functions/cash-relay/index.cjs'),'utf8');
  assert.match(relay,/exports\.readPhuHungCanonicalSource=onRequest\(/);
  assert.match(relay,/invoker:'private'/);
  const reader=fs.readFileSync(path.join(root,'functions/cash-relay/canonical-source-reader.cjs'),'utf8');
  assert.match(reader,/CASH_SHEETS_PRODUCTION_SOURCE_READ_ENABLED/);
});
