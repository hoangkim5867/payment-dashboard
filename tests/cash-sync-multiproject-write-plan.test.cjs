'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planTestSync,verifyAfterWrite,viewSignature,tabNames}=require('../server/cash-sync-multiproject-write-plan.cjs');
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
  assert.equal(p.preview.viewTab,tabNames('ELYSIAN').view);
  assert.equal(p.preview.mirrorTab,tabNames('ELYSIAN').mirror);
  assert.equal(p.preview.canWrite,false);
  assert.equal(p.preview.requiresServerAuthorization,true);
});
test('will not compose write without complete payment source or confirmed target',()=>{
  denied(()=>planTestSync({...data,sourceComplete:false}),'SOURCE_INCOMPLETE');
  denied(()=>planTestSync({...data,destinationConfirmed:false}),'DESTINATION_UNCONFIRMED');
});
test('already mirrored transaction is not duplicated on next compare',()=>{
  const old=[{...src,month:'2026-11',signature:token(src),status:'synced'}];
  const p=planTestSync({...data,mirror:old});
  assert.equal(p.preview.additions,0);
  assert.equal(p.preview.existingMirror,1);
});
test('edited Google mirror or removed Cash source rejects',()=>{
  denied(()=>planTestSync({...data,mirror:[{...src,signature:'fake',status:'synced'}]}),
    'MIRROR_TAMPERED');
  denied(()=>planTestSync({...data,source:[],mirror:[
    {...src,month:'2026-11',signature:token(src),status:'synced'}]}),'SOURCE_REMOVED');
});
test('foreign project and conflicting historical values block',()=>{
  denied(()=>planTestSync({...data,source:[{...src,project:'PHU HUNG'}]}),'SOURCE_ID');
  denied(()=>planTestSync({...data,history:[history[0],{...history[1],balance:123}]}),'HISTORY_BALANCE');
});
test('existing PHU HUNG-derived view is safely extended by next month',()=>{
  const prior=planTestSync({...data,source:[]});
  const rows=prior.expectedView.map(r=>({values:r.values.map(c=>
    c.userEnteredValue?.formulaValue??c.userEnteredValue?.numberValue??
    c.userEnteredValue?.stringValue??'')}));
  denied(()=>planTestSync({...data,currentView:rows,
    expectedViewSignature:'stale'}),'VIEW_CONFLICT');
  const compatible=planTestSync({...data,currentView:rows,
    expectedViewSignature:viewSignature(rows)});
  assert.equal(compatible.preview.originalViewSignature,viewSignature(rows));
  assert.equal(compatible.preview.wouldChange,true);
  assert.equal(compatible.preview.additions,1);
  assert.equal(compatible.expectedView.length,prior.expectedView.length+1);
  const edited=structuredClone(rows); edited[1].values[7]=999;
  denied(()=>planTestSync({...data,currentView:edited,
    expectedViewSignature:viewSignature(edited)}),'VIEW_REVIEW');
});
function readbackFor(p){
  const view=p.expectedView.map((row,i)=>({
    values:row.values.map((cell,j)=>i>0&&j===13?p.expectedBalances[i-1]:
      cell.userEnteredValue?.numberValue??
      cell.userEnteredValue?.stringValue??
      cell.userEnteredValue?.boolValue??'')
  }));
  const formulas=p.expectedView.slice(1).map(row=>[
    row.values[13].userEnteredValue.formulaValue
  ]);
  return {view,formulas};
}
test('full Google readback verifies amount, ID, formulas and calculated balances',()=>{
  const p=planTestSync(data);
  const found=[{...src,month:'2026-11',signature:token(src),status:'synced'}];
  const readback=readbackFor(p);
  denied(()=>verifyAfterWrite(p,{mirror:[],...readback}),'WRITE_NOT_VERIFIED');
  denied(()=>verifyAfterWrite(p,{mirror:found,view:readback.view}),
    'VIEW_NOT_VERIFIED');
  const v=verifyAfterWrite(p,{mirror:found,...readback});
  assert.equal(v.status,'FULL_READBACK_VERIFIED');
  assert.equal(v.balancesVerified,true);
  assert.equal(v.closingBalance,650);
  assert.equal(v.canWrite,false);
});
test('Google calculated balance mismatch blocks even with correct formula',()=>{
  const p=planTestSync(data),r=readbackFor(p);
  r.view[2].values[13]+=1;
  denied(()=>verifyAfterWrite(p,{mirror:[{...src,month:'2026-11',signature:token(src),status:'synced'}],...r}),
    'BALANCE_NOT_VERIFIED');
});
test('Google formula changed to hard-coded amount is rejected',()=>{
  const p=planTestSync(data),r=readbackFor(p);
  r.formulas[0][0]='900';
  denied(()=>verifyAfterWrite(p,{mirror:[{...src,month:'2026-11',signature:token(src),status:'synced'}],...r}),
    'FORMULA_NOT_VERIFIED');
});
test('Google altered source ID or amount is rejected even if final balance matches',()=>{
  const p=planTestSync(data),found=[{...src,month:'2026-11',signature:token(src),status:'synced'}];
  const r=readbackFor(p);
  r.view[3].values[15]='WRONG-ID';
  denied(()=>verifyAfterWrite(p,{mirror:found,...r}),'VIEW_NOT_VERIFIED');
  r.view[3].values[15]=src.id;
  r.view[3].values[7]+=20;
  denied(()=>verifyAfterWrite(p,{mirror:found,...r}),'VIEW_NOT_VERIFIED');
});
test('empty project cannot take historic ledger path without opening approval',()=>{
  denied(()=>planTestSync({...data,project:'S19-3',history:[],source:[]}),
    'OPENING_NOT_CONFIRMED');
});

test('readback rejects unexpected extra mirror rows after Google Sheets write',()=>{
  const p=planTestSync(data),r=readbackFor(p);
  const saved={...src,month:'2026-11',signature:token(src),status:'synced'};
  const injected={...saved,id:'unexpected-source-id'};
  denied(()=>verifyAfterWrite(p,{mirror:[saved,injected],...r}),'MIRROR_NOT_VERIFIED');
});
test('readback rejects changed old mirror even when new additions are intact',()=>{
  const old={...src,month:'2026-11',signature:token(src),status:'synced'};
  const newer={project:'ELYSIAN',id:'pay-12',...tx('2026-12-02',25,'LAB-12')};
  const p=planTestSync({...data,source:[src,newer],mirror:[old]});
  const r=readbackFor(p);
  const storedNew={...newer,month:'2026-12',signature:token(newer),status:'synced'};
  const editedOld={...old,signature:'tampered'};
  denied(()=>verifyAfterWrite(p,{mirror:[editedOld,storedNew],...r}),
    'MIRROR_NOT_VERIFIED');
});
