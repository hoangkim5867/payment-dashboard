'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspect}=require('../site/assets/js/cash-sync-lineage-audit.js');
const expense=(id='s1',overrides={})=>({id,project:'ELYSIAN',status:'paid',
  actualDate:'2026-10-12',direction:'out',...overrides});
const transfer=(id='t1',overrides={})=>({id,status:'paid',
  actualDate:'2026-10-12',fromProject:'ELYSIAN',toProject:'EATON',...overrides});
const output=(ids,date='2026-10-12')=>({date,_syncIds:ids});
const run=(exp,tr,rows)=>inspect('ELYSIAN',['2026-10'],exp,tr,[rows]);
test('salary/manual/finance and signed transfers are covered by original IDs',()=>{
 const x=run([expense('salary'),expense('manual')],[transfer()],
   [output(['expense:salary','expense:manual']),output(['transfer:t1:out'])]);
 assert.equal(x.expenseSources,2);
 assert.equal(x.transferSources,1);
 assert.equal(x.inMemoryLineageVerified,true);
 assert.equal(x.fullSourceCompletenessVerified,false);
 assert.equal(x.canWrite,false);
});
test('quarterly tax grouping preserves all source IDs, not just a representative',()=>{
 const x=run([expense('tax1'),expense('tax2')],[],
   [output(['expense:tax1','expense:tax2'])]);
 assert.equal(x.inMemoryLineageVerified,true);
 assert.equal(x.sourceIds,2);
 assert.equal(x.outputRows,1);
});
test('a dropped manual expense, missing payroll ID or transfer is reported',()=>{
 const x=run([expense('salary'),expense('manual')],[transfer()],
   [output(['expense:salary'])]);
 assert.equal(x.blockers.missingOutputIds,2);
 assert.equal(x.inMemoryLineageVerified,false);
});
test('duplicate source or ledger IDs do not pass',()=>{
 const x=run([expense('same'),expense('same')],[],
   [output(['expense:same','expense:same'])]);
 assert.equal(x.blockers.duplicateSourceId,1);
 assert.equal(x.blockers.duplicateOutputIds,1);
 assert.equal(x.inMemoryLineageVerified,false);
});
test('wrong source project and unpaid entries do not appear as mandatory',()=>{
 const x=run([expense('outside',{project:'EATON'}),expense('pending',{status:'pending'}),
   expense('valid')],[],[output(['expense:valid'])]);
 assert.equal(x.expenseSources,1);
 assert.equal(x.inMemoryLineageVerified,true);
});
test('transfer received and transfer sent are separate stable identities',()=>{
 const tr=transfer('t',{fromProject:'ELYSIAN',toProject:'ELYSIAN'});
 const x=run([],[tr],[output(['transfer:t:in']),output(['transfer:t:out'])]);
 assert.equal(x.transferSources,2);
 assert.equal(x.inMemoryLineageVerified,true);
});
test('an unknown ledger ID and shifted date remain blocked',()=>{
 const x=run([expense('known')],[],
   [output(['expense:known'],'2026-10-13'),output(['expense:orphan'])]);
 assert.equal(x.blockers.dateMismatch,1);
 assert.equal(x.blockers.orphanOutputIds,1);
 assert.equal(x.inMemoryLineageVerified,false);
});
test('missing source IDs, incorrect output dates and duplicate month are blocked',()=>{
 const x=run([expense('')],[],[output(['expense:x'],'2026-11-12')]);
 assert.equal(x.blockers.missingSourceId,1);
 assert.equal(x.blockers.invalidOutputDate,1);
 assert.equal(x.inMemoryLineageVerified,false);
 assert.throws(()=>inspect('ELYSIAN',['2026-10','2026-10'],[],[],[[],[]]),
 /repeated lineage month/);
});
