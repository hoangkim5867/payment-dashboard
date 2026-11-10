'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {auditSourceSnapshot}=require('../server/cash-sync-multiproject-preflight.cjs');
const row=(id,income,expense=0)=>({project:'ELYSIAN',id,date:'2026-11-09',
  amounts:[income,expense,0,0,0,0,0]});
test('internal transfer-out signed income preserves cash flow and remains read-only',()=>{
 const report=auditSourceSnapshot('ELYSIAN',[
   row('transfer:tx123:out',-500),row('transfer:tx123:in',500),
   row('expense:s1',0,100)]);
 assert.equal(report.netChange,-100);
 assert.equal(report.sourceValidated,true);
 assert.equal(report.canWrite,false);
 assert.equal(report.closingBalanceVerified,false);
});
test('negative income without transfer-out ID is blocked',()=>{
 for(const id of ['expense:pay123','transfer:tx123:in','manual123',
   'transfer:tx123:out:extra']){
   assert.throws(()=>auditSourceSnapshot('ELYSIAN',[row(id,-500)]),
     /verified transfer-out/);
 }
});
test('transfer-out cannot simultaneously contain a negative or positive expense',()=>{
 assert.throws(()=>auditSourceSnapshot('ELYSIAN',[
   row('transfer:tx123:out',-500,10)]),/verified transfer-out/);
 assert.throws(()=>auditSourceSnapshot('ELYSIAN',[
   row('transfer:tx123:out',-500,-10)]),/verified transfer-out/);
});
test('positive income and normal expense remain accepted',()=>{
 const report=auditSourceSnapshot('ELYSIAN',[
   row('transfer:tx123:in',500),row('expense:normal',0,200)]);
 assert.equal(report.netChange,300);
});
test('duplicate transfers still fail closed',()=>{
 assert.throws(()=>auditSourceSnapshot('ELYSIAN',[
   row('transfer:t:out',-50),row('transfer:t:out',-50)]),
 /Invalid, duplicate/);
});

test('same signed transfer passes the PHU HUNG-derived multiproject balance calculator',()=>{
 const {planTestSync}=require('../server/cash-sync-multiproject-write-plan.cjs');
 const base=(date,amount)=>({
   date,company:'Vendor A',contractNo:'LAB-01',content:'IPC',
   ipc:'IPC1',type:'Chi',income:0,subcontract:amount,material:0,
   otherDirect:0,indirect:0,financial:0,otherPayable:0
 });
 const history=[{...base('2026-10-01',100),rowId:2,balance:900},
   {...base('2026-10-02',100),rowId:3,balance:800}];
 const transfer={...base('2026-11-09',0),project:'ELYSIAN',
   id:'transfer:tx123:out',company:'Nội bộ',contractNo:'',ipc:'',
   content:'Chuyển nội bộ',type:'Transfer',income:-500};
 const result=planTestSync({project:'ELYSIAN',history,source:[transfer],
   sourceComplete:true,destinationConfirmed:true});
 assert.equal(result.preview.openingBalance,1000);
 assert.equal(result.preview.closingBalance,300);
 assert.equal(result.preview.additions,1);
 assert.equal(result.preview.canWrite,false);
});
