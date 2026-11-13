'use strict';
/*
 * Isolated Google Sheets TEST simulation. This is intentionally NOT a network
 * client and must never be shipped as a real writer. The mock uses immutable
 * snapshots and optimistic revision checking to model the race between
 * comparing and writing, including failures and retries.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const planner=require('../site/assets/js/cash-shared-test-sync-planner.js');
const clone=x=>structuredClone(x);
const evidence={sourceComplete:true,historyComplete:true,baselineRevalidated:true};
function row(sourceId,project='ELYSIAN',amount=100,date='2026-11-04'){
  return {sourceId,project,date,sourceType:'payment',
    company:'ACME',contractNo:'LAB-002',ipc:'IPC001',
    amounts:[0,amount,0,0,0,0,0]};
}
class FakeGoogleTestLedger{
  constructor({project='ELYSIAN',history=[],mirror=[],opening=1000}={}){
    this.project=project;this.history=clone(history);this.mirror=clone(mirror);
    this.opening=opening;this.version=1;this.writeCount=0;
  }
  read(){
    return {history:clone(this.history),mirror:clone(this.mirror),
      version:this.version,opening:this.opening};
  }
  delta(records){
    return records.reduce((sum,r)=>sum+r.amounts[0]-
      r.amounts.slice(1).reduce((n,v)=>n+v,0),0);
  }
  balance(){return this.opening+this.delta(this.history)+this.delta(this.mirror)}
  // Acts as the TEST API append: single atomic operation only on exact revision.
  appendAtVersion(entries,expected){
    if(this.version!==expected)throw Error('TEST_REVISION_CHANGED');
    const old=clone(this.mirror);
    try{
      for(const x of entries){
        if(old.some(y=>y.sourceId===x.sourceId))throw Error('TEST_DUPLICATE_ID');
        old.push(clone(x));
      }
      this.mirror=old;this.version++;this.writeCount++;
    }catch(error){throw error}
  }
}
function compareThenTestCommit(store,source,{beforeWrite=()=>{},evidenceOverride=evidence}={}){
  const first=store.read();
  const inputs={project:store.project,month:'2026-11',source,
    history:first.history,mirror:first.mirror,evidence:evidenceOverride};
  const preview=planner.prepare(inputs);
  if(!preview.testEligible)return {status:'BLOCKED_OR_NOOP',preview};
  beforeWrite(store);
  const last=store.read();
  const confirm=planner.prepare({...inputs,history:last.history,mirror:last.mirror});
  if(last.version!==first.version||
     JSON.stringify(confirm.testAdds)!==JSON.stringify(preview.testAdds)||
     !confirm.testEligible)
    return {status:'STALE',preview,confirm};
  const ids=new Set(preview.testAdds.map(x=>x.sourceId));
  const additions=source.filter(x=>ids.has(x.sourceId));
  const balanceBefore=store.balance();
  store.appendAtVersion(additions,first.version);
  const balanceAfter=store.balance();
  const expectedDelta=store.delta(additions);
  assert.equal(balanceAfter,balanceBefore+expectedDelta);
  return {status:'TEST_COMMITTED',preview,balanceBefore,balanceAfter};
}
test('Google TEST mock: append once, repeat click is no-op, balance correct',()=>{
 const store=new FakeGoogleTestLedger();
 const input=[row('tx:1')];
 const first=compareThenTestCommit(store,input);
 assert.equal(first.status,'TEST_COMMITTED');
 assert.equal(first.balanceBefore,1000);
 assert.equal(first.balanceAfter,900);
 assert.equal(store.writeCount,1);
 const second=compareThenTestCommit(store,input);
 assert.equal(second.status,'BLOCKED_OR_NOOP');
 assert.deepEqual(second.preview.unchanged,['tx:1']);
 assert.equal(store.writeCount,1);
 assert.equal(store.mirror.length,1);
});
test('Google TEST mock: changed amount of existing source ID blocks overwrite',()=>{
 const store=new FakeGoogleTestLedger();
 compareThenTestCommit(store,[row('tx:1')]);
 const second=compareThenTestCommit(store,[row('tx:1','ELYSIAN',130)]);
 assert.equal(second.status,'BLOCKED_OR_NOOP');
 assert.ok(second.preview.blockers.some(x=>x.reason==='MIRROR_CHANGED_SAME_ID'));
 assert.equal(store.balance(),900);
 assert.equal(store.writeCount,1);
});
test('Google TEST mock: concurrent manual edit invalidates snapshot, zero new writes',()=>{
 const store=new FakeGoogleTestLedger();
 const actual=compareThenTestCommit(store,[row('tx:1')],{
   beforeWrite:store=>{
     store.mirror.push(row('manual','ELYSIAN',5));
     store.version++;
   }
 });
 assert.equal(actual.status,'STALE');
 assert.equal(store.writeCount,0);
 assert.equal(store.mirror.some(x=>x.sourceId==='tx:1'),false);
});
test('Google TEST mock: different ledger project is refused without changing balance',()=>{
 const store=new FakeGoogleTestLedger({project:'SSIS',opening:1500});
 const result=compareThenTestCommit(store,[row('tx:1','ELYSIAN')]);
 assert.equal(result.status,'BLOCKED_OR_NOOP');
 assert.equal(store.balance(),1500);
 assert.equal(store.writeCount,0);
});
test('Google TEST mock: existing historical transaction blocks duplicate payment',()=>{
 const store=new FakeGoogleTestLedger({history:[row('old','ELYSIAN')]});
 const before=store.balance();
 const result=compareThenTestCommit(store,[row('tx:1')]);
 assert.equal(result.status,'BLOCKED_OR_NOOP');
 assert.ok(result.preview.blockers.some(x=>x.reason==='HISTORY_CANDIDATE_NEEDS_ID'));
 assert.equal(store.balance(),before);
 assert.equal(store.writeCount,0);
});
test('Google TEST mock: unverified transfer cannot insert even on empty TEST ledger',()=>{
 const store=new FakeGoogleTestLedger();
 const transfer={...row('transfer:1'),sourceType:'transfer',counterpartVerified:false};
 const result=compareThenTestCommit(store,[transfer]);
 assert.equal(result.status,'BLOCKED_OR_NOOP');
 assert.ok(result.preview.blockers.some(x=>x.reason==='TRANSFER_COUNTERPART_UNVERIFIED'));
 assert.equal(store.writeCount,0);
});
test('Google TEST mock: incomplete source blocks even if signature is new',()=>{
 const store=new FakeGoogleTestLedger();
 const result=compareThenTestCommit(store,[row('tx:1')],{
   evidenceOverride:{sourceComplete:false,historyComplete:true,baselineRevalidated:true}});
 assert.equal(result.status,'BLOCKED_OR_NOOP');
 assert.equal(store.writeCount,0);
});
test('Google TEST mock: one invalid item aborts the whole planned batch',()=>{
 const store=new FakeGoogleTestLedger();
 const input=[row('tx:1'),{...row('tx:2','ELYSIAN',200),ipc:''}];
 const result=compareThenTestCommit(store,input);
 assert.equal(result.status,'BLOCKED_OR_NOOP');
 assert.equal(store.mirror.length,0);
 assert.equal(store.writeCount,0);
});
