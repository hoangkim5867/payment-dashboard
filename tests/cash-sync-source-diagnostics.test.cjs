'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect}=require('../site/assets/js/cash-sync-source-diagnostics.js');
const tx=(overrides={})=>({
  project:'ELYSIAN',date:'2026-10-01',_syncIds:['expense:p1'],
  income:0,subcontract:100,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0,
  ...overrides
});
test('staging source never certifies completeness even with stable IDs',()=>{
  const r=inspect('ELYSIAN',[{month:'2026-10',rows:[tx()]}],
    {paymentProjectLoaded:true,firebaseProject:'cash-control-staging'});
  assert.equal(r.transactions,1);assert.equal(r.canWrite,false);
  assert.equal(r.sourceCompletenessVerified,false);
  assert.equal(r.productionSource,false);assert(r.reasons.length>0);
});
test('missing ID and duplicate ID reject apparently paid source',()=>{
  const r=inspect('ELYSIAN',[{month:'2026-10',rows:[tx(),tx(),tx({_syncIds:[]})]}],
    {paymentProjectLoaded:true,firebaseProject:'cscecmep-payment'});
  assert.equal(r.duplicateIds,1);assert.equal(r.missingIds,1);
  assert.equal(r.sourceStructureValid,false);assert.equal(r.canWrite,false);
});
test('valid unique production memory is still not proof of historical reconciliation',()=>{
  const r=inspect('ELYSIAN',[{month:'2026-10',rows:[tx()]}],
    {paymentProjectLoaded:true,firebaseProject:'cscecmep-payment'});
  assert.equal(r.sourceStructureValid,true);
  assert.equal(r.sourceCompletenessVerified,false);
  assert.equal(r.canWrite,false);
});
test('bad project identity, nonnumeric source and duplicate months remain blocked',()=>{
  const r=inspect('ELYSIAN',[{month:'2026-10',
    rows:[tx({project:'EATON'}),tx({income:'100'})]}],
    {paymentProjectLoaded:true,firebaseProject:'cscecmep-payment'});
  assert.equal(r.wrongProject,1);assert.equal(r.invalidAmounts,1);
  assert.equal(r.canWrite,false);
  assert.throws(()=>inspect('ELYSIAN',
    [{month:'2026-10',rows:[]},{month:'2026-10',rows:[]}]),/Duplicate source month/);
});
