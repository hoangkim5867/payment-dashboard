'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const adapter=require('../site/assets/js/cash-shared-source-adapter.js');
const planner=require('../site/assets/js/cash-shared-test-sync-planner.js');
const auditor=require('../site/assets/js/cash-sync-historical-audit.js');
const cash=(override={})=>({
 date:'2026-11-03',company:'Subcontractor',contractNo:'LAB-001',
 content:'IPC01',ipc:'IPC001',type:'分包款',income:0,subcontract:100,
 material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0,
 _syncIds:['expense:abc'],...override
});
const records=new Map([['abc',{id:'abc',source:'payment'}]]);
const history=(override={})=>{
 const row=['2026-11-03','Subcontractor','LAB-001','IPC01','IPC001','分包款',0,100,0,0,0,0,0];
 for(const [key,value] of Object.entries(override))row[Number(key)]=value;
 return row;
};
test('real Cash Control Payment export maps exactly one source ID and 7 amount buckets',()=>{
 const result=adapter.projectSource({project:'ELYSIAN',rows:[cash()],expensesById:records});
 assert.equal(result.blocked.length,0);
 assert.equal(result.rows[0].sourceId,'ELYSIAN:expense:abc');
 assert.equal(result.rows[0].sourceType,'payment');
 assert.deepEqual(result.rows[0].amounts,[0,100,0,0,0,0,0]);
});
test('grouped quarterly tax and unknown source IDs are blocked, never guessed',()=>{
 const result=adapter.projectSource({project:'ELYSIAN',
  rows:[cash({_syncIds:['expense:a','expense:b']}),
   cash({_syncIds:['expense:missing']})],expensesById:records});
 assert.ok(result.blocked.some(x=>x.reason==='NO_SINGLE_STABLE_SOURCE_ID'));
 assert.ok(result.blocked.some(x=>x.reason==='UNKNOWN_SOURCE_MODULE'));
});
test('cross-project transfers stay unverified even if all numeric amounts match',()=>{
 const one=cash({_syncIds:['transfer:t1:out'],income:-100,subcontract:0,
   contractNo:'',ipc:''});
 const p=adapter.preview({project:'ELYSIAN',cashRows:[one],
   googleValues:[],expensesById:records,month:'2026-11',planner,
   dateValue:auditor.dateValue});
 assert.ok(p.plan.blockers.some(x=>x.reason==='TRANSFER_COUNTERPART_UNVERIFIED'));
 assert.equal(p.canWrite,false);
});
test('Google historical serial date is parsed using audited dateValue',()=>{
 const serial=auditor.dateValue(46329);
 assert.match(serial,/^20\d{2}-\d{2}-\d{2}$/);
 const source=adapter.projectHistory({project:'SSIS',
   values:[[46329,'ACME','C1','','IPC01','',100,0,0,0,0,0,0]],
   dateValue:auditor.dateValue});
 assert.equal(source.rows.length,1);
 assert.equal(source.rows[0].date,serial);
});
test('ordinary Google historic match blocks duplicate, no writes possible',()=>{
 const p=adapter.preview({project:'ELYSIAN',cashRows:[cash()],
  googleValues:[history()],expensesById:records,month:'2026-11',
  planner,dateValue:auditor.dateValue});
 assert.equal(p.plan.testAdds.length,0);
 assert.equal(p.plan.historicCandidates.length,1);
 assert.equal(p.plan.canWriteProduction,false);
 assert.equal(p.writesPerformed,0);
});
test('FOXCONN requires a dedicated verified tax column and 8 amounts',()=>{
 const noTax=adapter.projectSource({project:'FOXCONN',
   rows:[cash()],foxconn:true,expensesById:records});
 assert.ok(noTax.blocked.some(x=>x.reason==='INVALID_AMOUNT_OR_TAX_MAPPING'));
 const withTax=adapter.projectSource({project:'FOXCONN',
   rows:[cash({importTaxVat:50})],foxconn:true,expensesById:records});
 assert.equal(withTax.rows[0].amounts.length,8);
 assert.equal(withTax.rows[0].amounts[7],50);
});
test('non-Payment payroll source cannot become production eligible from description',()=>{
 const source=adapter.projectSource({project:'SSIS',rows:[cash({
   _syncIds:['expense:payroll-1'],content:'Lương tháng 10/2026',contractNo:'',
   ipc:''})],expensesById:new Map([['payroll-1',{source:'payroll'}]])});
 assert.equal(source.rows[0].sourceType,'nonpayment');
 assert.equal(source.rows[0].identityVerified,false);
});
test('shared adapter + current UI must never issue new network reads or permit a write',()=>{
 const code=fs.readFileSync(path.join(__dirname,'../site/assets/js/cash-shared-source-adapter.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
 assert.doesNotMatch(code,/\b(?:fetch|setDoc|updateDoc|addDoc|writeBatch|XMLHttpRequest)\s*\(/);
 const start=html.indexOf('async function ccSyncCompareProjectGoogleReadOnly(){');
 const stop=html.indexOf('function ccSyncProjectCatalogRender()',start);
 const block=html.slice(start,stop);
 assert.match(block,/adapter\.preview\(\{project,cashRows:source/);
 assert.match(block,/googleValues:payload\.values/);
 assert.match(block,/month:CURRENT,planner,dateValue:auditor\.dateValue/);
 assert.doesNotMatch(block,/(?:setDoc|updateDoc|addDoc|writeBatch)\s*\(/);
});
