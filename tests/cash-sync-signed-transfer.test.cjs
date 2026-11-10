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
