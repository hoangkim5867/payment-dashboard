'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const planner=require('../site/assets/js/cash-shared-test-sync-planner.js');
const base={sourceId:'cash:a',project:'ELYSIAN',date:'2026-11-02',
  sourceType:'payment',company:'ACME',contractNo:'LAB-01',ipc:'IPC001',
  amounts:[0,0,100,0,0,0,0]};
const evidence={sourceComplete:true,historyComplete:true,baselineRevalidated:true};
const plan=(over={})=>planner.prepare({project:'ELYSIAN',month:'2026-11',
  source:[base],history:[],mirror:[],evidence,...over});
test('new eligible transaction can be staged in isolated TEST plan, NEVER production',()=>{
 const p=plan();
 assert.deepEqual(p.testAdds.map(x=>x.sourceId),['cash:a']);
 assert.equal(p.testEligible,true);
 assert.equal(p.productionApproved,false);
 assert.equal(p.canWriteProduction,false);
 assert.equal(p.writesPerformed,0);
});
test('same mirror ID and payload is a no-op on second execution',()=>{
 const p=plan({mirror:[base]});
 assert.deepEqual(p.unchanged,['cash:a']);
 assert.deepEqual(p.testAdds,[]);
 assert.equal(p.testEligible,false);
 assert.equal(p.blockers.length,0);
});
test('same ID but changed amount blocks rather than overwriting edited row',()=>{
 const p=plan({mirror:[{...base,amounts:[0,0,99,0,0,0,0]}]});
 assert.equal(p.testAdds.length,0);
 assert.ok(p.blockers.some(x=>x.reason==='MIRROR_CHANGED_SAME_ID'));
});
test('historic row without source ID is a candidate, never inserted again',()=>{
 const p=plan({history:[{...base,sourceId:''}]});
 assert.equal(p.testAdds.length,0);
 assert.equal(p.historicCandidates[0].exactIdentity,1);
 assert.ok(p.blockers.some(x=>x.reason==='HISTORY_CANDIDATE_NEEDS_ID'));
});
test('duplicate ID, signature, and history/mirror overlap all stop',()=>{
 const cases=[
  plan({source:[base,base]}),
  plan({source:[base,{...base,sourceId:'cash:b'}]}),
  plan({history:[base],mirror:[base]})
 ];
 assert.ok(cases[0].blockers.some(x=>x.reason==='INVALID_OR_DUPLICATE_SOURCE'));
 assert.ok(cases[1].blockers.some(x=>x.reason==='DUPLICATE_SOURCE_SIGNATURE_AND_IDENTITY'));
 assert.ok(cases[2].blockers.some(x=>x.reason==='MIRROR_ALREADY_IN_HISTORY'));
 for(const p of cases){assert.equal(p.testAdds.length,0);assert.equal(p.writesPerformed,0)}
});
test('incomplete sources, transfer counterpart and non-payment identity block',()=>{
 const cases=[
  plan({evidence:{sourceComplete:true,historyComplete:false,baselineRevalidated:true}}),
  plan({source:[{...base,sourceType:'transfer',counterpartVerified:false}]}),
  plan({source:[{...base,sourceType:'personnel',identityVerified:false}]})
 ];
 for(const p of cases){assert.equal(p.testEligible,false);assert.equal(p.testAdds.length,0)}
});
test('different projects cannot be cross-linked even if date and money match',()=>{
 assert.ok(plan({history:[{...base,project:'SSIS'}]}).blockers.some(
   x=>x.reason==='INVALID_HISTORY'));
});
test('source module has zero network/Firestore/Google request primitives',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../site/assets/js/cash-shared-test-sync-planner.js'),'utf8');
 assert.doesNotMatch(code,/\b(?:fetch|XMLHttpRequest|setDoc|updateDoc|addDoc|deleteDoc|writeBatch)\s*\(/);
 assert.match(code,/canWriteProduction:false/);
 assert.match(code,/writesPerformed:0/);
});
