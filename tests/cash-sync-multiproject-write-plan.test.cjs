'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planTestSync,verifyAfterWrite,viewSignature}=require('../server/cash-sync-multiproject-write-plan.cjs');
const {token}=require('../site/assets/js/cash-sync-multiproject-planner.js');
const tx=(date,amount,contractNo)=>({date,company:'Supplier A',contractNo,
  content:'IPC',ipc:'IPC01',type:'支出',income:0,subcontract:amount,
  material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0});
const history=[{...tx('2026-10-01',100,'LAB-01'),rowId:2,balance:900},
  {...tx('2026-10-03',200,'LAB-02'),rowId:3,balance:700}];
const src={project:'ELYSIAN',id:'pay-11',...tx('2026-11-02',50,'LAB-11')};
const data={project:'ELYSIAN',history,source:[src],sourceComplete:true,destinationConfirmed:true};
const denied=(fn,code)=>assert.throws(fn,e=>e.code===code);
test('real PHU HUNG renderer is reused for read-only multi-project compare',()=>{
  const p=planTestSync(data);
  assert.equal(p.preview.openingBalance,1000);
  assert.equal(p.preview.closingBalance,650);
  assert.equal(p.preview.historicCount,2);
  assert.equal(p.preview.additions,1);
  assert.equal(p.expectedView.length,4);
  assert.equal(p.preview.viewTab,'PROJECT_VIEW');
  assert.equal(p.preview.mirrorTab,'DATA_CASHCONTROL');
  assert.equal(p.preview.canWrite,false);
  assert.equal(p.preview.requiresServerAuthorization,true);
});
test('will not compose write without complete payment source or confirmed target',()=>{
  denied(()=>planTestSync({...data,sourceComplete:false}),'SOURCE_INCOMPLETE');
  denied(()=>planTestSync({...data,destinationConfirmed:false}),'DESTINATION_UNCONFIRMED');
});
test('already mirrored transaction is not duplicated on next compare',()=>{
  const old=[{...src,signature:token(src),status:'synced'}];
  const p=planTestSync({...data,mirror:old});
  assert.equal(p.preview.additions,0);
  assert.equal(p.preview.existingMirror,1);
});
test('edited Google mirror or removed Cash source rejects',()=>{
  denied(()=>planTestSync({...data,mirror:[{...src,signature:'fake',status:'synced'}]}),
    'MIRROR_TAMPERED');
  denied(()=>planTestSync({...data,source:[],mirror:[
    {...src,signature:token(src),status:'synced'}]}),'SOURCE_REMOVED');
});
test('foreign project and conflicting historical values block',()=>{
  denied(()=>planTestSync({...data,source:[{...src,project:'PHU HUNG'}]}),'SOURCE_ID');
  denied(()=>planTestSync({...data,history:[history[0],{...history[1],balance:123}]}),'HISTORY_BALANCE');
});
test('existing view never overwritten blindly; matching view is unchanged',()=>{
  const p=planTestSync(data);
  const rows=p.expectedView.map(r=>({values:r.values.map(c=>
    c.userEnteredValue?.formulaValue??c.userEnteredValue?.numberValue??
    c.userEnteredValue?.stringValue??'')}));
  denied(()=>planTestSync({...data,currentView:rows,
    expectedViewSignature:'stale'}),'VIEW_CONFLICT');
  const compatible=planTestSync({...data,currentView:rows,
    expectedViewSignature:viewSignature(rows)});
  assert.equal(compatible.preview.wouldChange,true); // mirror still missing
});
test('readback cannot claim balance verification without evaluated formulas',()=>{
  const p=planTestSync(data);
  const found=[{...src,signature:token(src),status:'synced'}];
  denied(()=>verifyAfterWrite(p,{mirror:[],view:[]}),'WRITE_NOT_VERIFIED');
  const v=verifyAfterWrite(p,{mirror:found,view:p.expectedView.map(x=>({values:x.values}))});
  assert.equal(v.status,'SNAPSHOT_MATCH_ONLY');
  assert.equal(v.balancesVerified,false);
  assert.equal(v.canWrite,false);
});
test('empty project cannot take historic ledger path without opening approval',()=>{
  denied(()=>planTestSync({...data,project:'S19-3',history:[],source:[]}),
    'OPENING_NOT_CONFIRMED');
});
