'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {prepareProjectView}=require('../server/cash-sync-multiproject-phu-adapter.cjs');
const tx=(date,subcontract,contractNo='LAB-01')=>({
  date,company:'Vendor A',contractNo,content:'IPC',ipc:'IPC01',type:'支出',
  income:0,subcontract,material:0,otherDirect:0,indirect:0,
  financial:0,otherPayable:0
});
const history=[{...tx('2026-10-01',100),rowId:3,balance:900},
  {...tx('2026-10-05',150,'LAB-02'),rowId:4,balance:750}];
const source=(date,amount,id)=>({project:'ELYSIAN',id,...tx(date,amount,'LAB-'+id)});
test('ELYSIAN inherits PHU HUNG balance formulas and fixed 17-column grid',()=>{
  const original=JSON.stringify(history);
  const p=prepareProjectView({project:'ELYSIAN',history,
    source:[source('2026-12-02',50,'DEC'),source('2026-11-03',20,'NOV')]});
  assert.equal(p.renderer,'REUSED_PHU_HUNG_BUILD_LEDGER');
  assert.equal(p.openingBalance,1000);
  assert.equal(p.closingBalance,680);
  assert.equal(p.grid.length,5);
  assert.equal(p.headers.length,17);
  assert.equal(p.rows[3].formula,'=N4+G5-SUM(H5:M5)');
  assert.equal(p.canWrite,false);
  assert.equal(JSON.stringify(history),original);
});
test('matched historic expense is not duplicated in resulting ledger',()=>{
  const matched={project:'ELYSIAN',id:'MATCH',...history[0]};
  delete matched.rowId;delete matched.balance;
  const p=prepareProjectView({project:'ELYSIAN',history,source:[matched]});
  assert.equal(p.matchedHistory,1);
  assert.equal(p.rows.length,2);
  assert.equal(p.closingBalance,750);
});
test('invalid original balance fails before renderer can be used',()=>{
  assert.throws(()=>prepareProjectView({project:'ELYSIAN',
    history:[history[0],{...history[1],balance:999}],source:[]}),
    e=>e.code==='HISTORY_BALANCE');
});
test('new empty project stays blocked for separate opening-balance approval',()=>{
  const p=prepareProjectView({project:'S19-3',history:[],source:[],openingBalance:0});
  assert.equal(p.renderer,'NEW_PROJECT_NEEDS_APPROVAL');
  assert.equal(p.canWrite,false);
  assert.equal(p.grid,undefined);
});
test('ambiguous historic duplicates are not silently resolved',()=>{
  const dup=[history[0],{...history[0],rowId:4,balance:800}];
  const matched={project:'ELYSIAN',id:'DUP',...history[0]};
  delete matched.rowId;delete matched.balance;
  assert.throws(()=>prepareProjectView({project:'ELYSIAN',history:dup,source:[matched]}),
    e=>e.code==='AMBIGUOUS_HISTORY');
});
