'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {prepareOneTimeBootstrap}=require('../functions/cash-relay/one-time-bootstrap.cjs');
const {COLLECTION,DOCUMENT}=require('../functions/cash-relay/source-cache.cjs');
const {readCache}=require('../functions/cash-relay/source-cache.cjs');
const projectEnv={GCLOUD_PROJECT:'cscecmep-payment',
  CASH_SHEETS_SOURCE_BOOTSTRAP_APPROVED:'YES',
  CASH_SHEETS_PRODUCTION_CACHE_ENABLED:'YES',
  CASH_SHEETS_PRODUCTION_RELAY_ENABLED:'YES'};
const timestamp=s=>({seconds:1793952000+s,nanoseconds:0});
const fixture=()=>{
  const records=new Map(),stats={reads:0,writes:0,queries:0};
  const bootstrap=[{id:'P1',data:()=>({
    project:'PHU HUNG',amount:321000,processActualAmount:321000,
    processPaymentDate:'2026-11-06',costType:'间接费'
  }),updateTime:timestamp(1)}];
  const ref={async get(){stats.reads++;return {
    exists:records.has(DOCUMENT),data:()=>records.get(DOCUMENT)}}};
  const db={
    collection(c){
      if(c===COLLECTION)return {doc(id){assert.equal(id,DOCUMENT);return ref}};
      if(c==='payments')return {where(field,cmp,value){
        stats.queries++;
        assert.deepEqual([field,cmp,value],['project','==','PHU HUNG']);
        return {async get(){
          stats.reads+=bootstrap.length;
          return {size:bootstrap.length,readTime:timestamp(2),docs:bootstrap};
        }};
      }};
      throw Error('Unapproved query collection '+c);
    },
    async runTransaction(fn){
      const writes=[];
      const tx={async get(){stats.reads++;return {
        exists:records.has(DOCUMENT),data:()=>records.get(DOCUMENT)
      }},set(_,val){writes.push(val)}};
      const result=await fn(tx);
      for(const w of writes){records.set(DOCUMENT,w);stats.writes++}
      return result;
    }
  };
  return {db,records,stats};
};
test('only production with explicit one-time bootstrap and cache/relay approval may query',async()=>{
  const f=fixture();
  for(const bad of [
    {...projectEnv,GCLOUD_PROJECT:'cash-control-staging'},
    {...projectEnv,CASH_SHEETS_SOURCE_BOOTSTRAP_APPROVED:'NO'},
    {...projectEnv,CASH_SHEETS_PRODUCTION_CACHE_ENABLED:'NO'},
    {...projectEnv,CASH_SHEETS_PRODUCTION_RELAY_ENABLED:'NO'}
  ])await assert.rejects(prepareOneTimeBootstrap({db:f.db,env:bad}),/NOT authorized/);
  assert.equal(f.stats.queries,0);
  assert.equal(f.stats.writes,0);
});
test('approved operator performs exactly one project query; source remains unsafe for automatic Sheets writes',async()=>{
  const f=fixture();
  const result=await prepareOneTimeBootstrap({db:f.db,env:projectEnv});
  assert.equal(result.status,'captured-for-audit');
  assert.equal(result.sourceCount,1);
  assert.equal(result.sourceComplete,false);
  assert.equal(result.googleSyncActivated,false);
  assert.equal(f.stats.queries,1);
  assert.equal(f.stats.writes,1);
  assert.throws(()=>readCache(f.records.get(DOCUMENT)),/Incomplete/);
  await assert.rejects(prepareOneTimeBootstrap({db:f.db,env:projectEnv}),/already bootstrapped/);
  assert.equal(f.stats.queries,1,'repeat bootstrap must never rescan Payment');
});
test('missing stable readTime fails closed without writing any cached Payment',async()=>{
  const f=fixture();
  const oldWhere=f.db.collection('payments').where;
  const coll=f.db.collection;
  f.db.collection=function(name){
    const r=coll.call(f.db,name);
    if(name!=='payments')return r;
    return {where(...args){
      const result=r.where(...args);
      return {async get(){
        const snap=await result.get();
        return {...snap,readTime:null};
      }};
    }};
  };
  await assert.rejects(prepareOneTimeBootstrap({db:f.db,env:projectEnv}),
    /Unverified/);
  assert.equal(f.stats.writes,0);
});
