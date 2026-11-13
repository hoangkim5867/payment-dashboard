'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const auditor=require('../site/assets/js/cash-sync-historical-audit.js');
const header=[...Array(13).fill(''),'进口税+增值税','余额'];
const h=(ipc,date='2026-10-01')=>[date,'ACME','C1','',ipc,'',100,20,0,0,0,0,0,10,70];
const s=(ipc,date='2026-10-01')=>({date,company:'ACME',contractNo:'C1',ipc,
  income:100,subcontract:20,material:0,otherDirect:0,indirect:0,
  financial:0,otherPayable:0,importTaxVat:10});
test('FOXCONN equal same-value signatures are ambiguous but no excess',()=>{
  const r=auditor.compareFoxconnCandidates([header,h('IPC1'),h('IPC2')],[s('IPC1'),s('IPC2')]);
  assert.equal(r.ambiguous,2);assert.equal(r.sourceOnly,0);
  assert.deepEqual(r.excessSignatureGroups,[]);
});
test('FOXCONN two source entries, one historical: expose whole group without guessing extra',()=>{
  const r=auditor.compareFoxconnCandidates([header,h('IPC1')],[s('IPC1'),s('IPC2')]);
  assert.equal(r.sourceOnly,1);
  assert.deepEqual(r.sourceOnlyPositions,[],'no single proven extra row');
  assert.equal(r.excessSignatureGroups.length,1);
  const g=r.excessSignatureGroups[0];
  assert.deepEqual(g.sourcePositions,[1,2]);
  assert.deepEqual(g.googlePositions,[2]);
  assert.equal(g.unmatchedCount,1);
  assert.equal(g.direction,'CASH_MORE');
  assert.equal(g.confirmedExtraPosition,null);
  assert.equal(g.canWrite,false);assert.equal(r.canWrite,false);
});
test('FOXCONN excess historical rows: preserve actual Google worksheet row positions',()=>{
  const r=auditor.compareFoxconnCandidates([header,h('IPC1'),h('IPC2')],[s('IPC1')]);
  assert.equal(r.historyOnly,1);
  assert.equal(r.excessSignatureGroups[0].direction,'GOOGLE_MORE');
  assert.deepEqual(r.excessSignatureGroups[0].googlePositions,[2,3]);
  assert.deepEqual(r.excessSignatureGroups[0].sourcePositions,[1]);
});
test('distinct numeric signatures retain existing exact source-only diagnostics',()=>{
  const r=auditor.compareFoxconnCandidates([header,h('IPC1')],[s('IPC1'),{
    ...s('IPC3'),income:101}]);
  assert.deepEqual(r.sourceOnlyPositions,[2]);
  assert.deepEqual(r.excessSignatureGroups,[]);
  assert.equal(r.canWrite,false);
});
